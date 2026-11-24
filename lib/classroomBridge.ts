'use client';
import type {SupabaseClient} from '@supabase/supabase-js';
import {isMissingMigration} from './data';
import {t, getLang} from './i18n';
import {authFetch, freshToken} from './authFetch';
/** Calendar date on this device (a lesson at 21:00 in Brazil belongs to that day, not to the next UTC day). */
const localDate = () => new Date().toLocaleDateString('en-CA');
import {diffLegacyDb,matchBackupStudents,mergeBackupLessons,parseKey,rowsToLegacyDb,snapshot,type LegacyDb,type LegacyLesson,type LessonRow,type StudentRow} from './classroomMapping';

/**
 * The bridge the existing live classroom (public/legacy/index.html, loaded in a
 * same-origin iframe) calls instead of the old password-protected Redis API.
 * Every read and write goes through the logged-in user's Supabase session, so
 * Row Level Security decides what is allowed — never the iframe.
 */
export type TeachyBridge = {
  /** v42: planned start of the lesson in the agenda (ISO), used for the lesson timer; null without a planned lesson */
  lessonStartsAt?: string | null;
  /** v46: images in the shared Canvas (private Storage bucket; the Canvas only stores the path). Teacher and linked student. */
  uploadCanvasImage?(file: Blob): Promise<{path?: string; error?: string}>;
  canvasImageUrl?(path: string): Promise<string | null>;
  /** v43 teacher only: heartbeat with the joint presence (seconds) of this classroom session; the server registers the lesson. */
  presence?(p: {key: string; joint: number}): Promise<{registered?: boolean; threshold?: number; expired?: boolean; error?: string}>;
  version: 1;
  role: 'teacher' | 'student';
  studentId: string;
  studentName: string;
  liveUrl: string;
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  token(force?: boolean): Promise<string>;
  /** v38: TURN/ICE servers from the server (environment variable), only for logged-in users. [] = STUN only. */
  iceServers?(): Promise<{urls: string | string[]; username?: string; credential?: string}[]>;
  /** Why there is (no) TURN: ok, missing, invalid, no_turn, http_401/403/404/500, error. Never contains credentials. */
  iceStatus?(): string;
  switchStudent(id: string): void;
  /** v58: lessonDate / lessonId are fixed when the recording STARTS (a recording saved later, e.g. after the tab was
   *  closed, keeps its own lesson); without them: today and the lesson of this classroom session. */
  uploadRecording(blob: Blob, meta: {durationSeconds: number; teacherConsentAt: string; studentConsentAt: string; aiTeacherAt?: string | null; aiStudentAt?: string | null; lessonDate?: string | null; lessonId?: string | null}, tracks?: RecordingTracks): Promise<{ok: boolean; error?: string; analysis?: string}>;
  /** v58 teacher only: the planned lesson of this classroom session (if any). */
  lessonId?: string | null;
  previewImport(backup: unknown): Promise<{oldName: string; newName: string | null}[]>;
  importBackup(backup: unknown): Promise<string>;
  /** Personal hover translation (never written to the shared canvas). */
  translate(term: string, context: string, target?: string): Promise<TranslateResult>;
  /** Teacher only: AI proposal for a tidier canvas page (preview first, nothing is written). */
  tidy(blocks: {t: string; text: string}[]): Promise<{blocks: {type: 'h' | 'p' | 'li'; text: string}[]; changes: string[]}>;
  /** v62 teacher only: canvas vocabulary → central word bank. */
  vocab?(o: {page?: number | null; list?: boolean}): Promise<{added?: number; known?: number; aiCalls?: number; list?: {term: string; translation: string; pos: string | null; kind: string; grammar: Record<string, unknown> | null}[]}>;
  /** Page-level actions shown in the classroom's own menu (one combined top bar). */
  ui?: {back(): void; dashboard(): void; privateNotes?(): void; assistant(): void; setLang?(lang: string): void; games?(): void};
  /** v35 word games: messages {t:'game'} from the other player, and (teacher) the student (re)connected. */
  onGame?(m: unknown): void;
  onPeerHello?(): void;
  /** Interface language of the app (the classroom follows it; not the language being taught). */
  uiLang?: string;
  /** Photo of the other participant (signed URL or Google photo), shown in the classroom top bar. */
  peerAvatar?: string;
};
export type RecordingTracks = {teacher?: Blob | null; student?: Blob | null};
export type TranslateResult = {translation: string; expression: string | null; expression_translation: string | null; note: string; target: string};

async function postJson<T>(db: SupabaseClient, path: string, body: unknown): Promise<T> {
  const r = await authFetch(db, path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body && typeof body === 'object' && !Array.isArray(body) ? {uiLang: getLang(), ...body as object} : body)});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(t((j as {error?: string}).error || '') || t('Fout {0}', r.status));
  return j as T;
}
const translateCache = new Map<string, Promise<TranslateResult>>();
function translator(db: SupabaseClient) {
  // v40: optional target language (canvas "Vertalen" with a chosen language); same server cache per term+sentence+language
  return (term: string, context: string, target?: string) => {
    const tg = target && /^[a-z]{2}$/.test(target) ? target : '';
    const k = term.toLowerCase() + '\u0000' + context.toLowerCase() + '\u0000' + tg;
    if (!translateCache.has(k)) {
      const p = postJson<TranslateResult>(db, '/api/ai/translate', tg ? {term, context, target: tg} : {term, context});
      p.catch(() => translateCache.delete(k));
      translateCache.set(k, p);
    }
    return translateCache.get(k)!;
  };
}

declare global { interface Window { teachyBridge?: TeachyBridge } }

const LESSON_COLS = 'student_id,lesson_date,notes,homework,words,sorted';

/* v46: Canvas images. Validated here (type by content, max 5 MB) and again by Storage (bucket limits) and RLS (path =
   student folder). Name = SHA-256 of the content → the same image is stored once; signed URLs are cached briefly. */
export const CANVAS_IMG_MAX = 5 * 1024 * 1024;
export function sniffImage(b: Uint8Array): 'png' | 'jpg' | 'webp' | 'gif' | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}
const MIME = {png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif'} as const;
function canvasImages(db: SupabaseClient, studentId: string) {
  const urls = new Map<string, {url: string; until: number}>();
  return {
    async uploadCanvasImage(file: Blob) {
      if (!file || file.size === 0) return {error: t('Lege afbeelding')};
      if (file.size > CANVAS_IMG_MAX) return {error: t('Afbeelding is te groot (max. 5 MB)')};
      const buf = new Uint8Array(await file.arrayBuffer());
      const ext = sniffImage(buf);
      if (!ext) return {error: t('Alleen JPG, PNG, WebP of GIF')};
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf))).map(x => x.toString(16).padStart(2, '0')).join('');
      const path = `${studentId}/${hash}.${ext}`;
      const up = await db.storage.from('canvas-images').upload(path, new Blob([buf], {type: MIME[ext]}), {contentType: MIME[ext], upsert: false});
      if (up.error && !/exist|duplicate|409/i.test(up.error.message)) return {error: /bucket/i.test(up.error.message) ? t('Afbeeldingen zijn nog niet ingesteld: voer supabase/v46.sql uit.') : up.error.message};
      return {path};
    },
    async canvasImageUrl(path: string) {
      if (!new RegExp('^' + studentId + '/[0-9a-f]{64}\\.(png|jpg|webp|gif)$').test(path)) return null; // only this student's images
      const c = urls.get(path); if (c && c.until > Date.now()) return c.url;
      const r = await db.storage.from('canvas-images').createSignedUrl(path, 3600);
      if (r.error || !r.data) return null;
      urls.set(path, {url: r.data.signedUrl, until: Date.now() + 50 * 60e3});
      return r.data.signedUrl;
    },
  };
}

/** TURN credentials are never in the classroom code: fetched once per page from /api/turn (logged-in users only). */
// v60: kept per classroom (student) and ONLY when it worked — before, one failed request (expired login, a classroom
// without access, a network hiccup) was kept for the whole page, so every next classroom showed "TURN ontbreekt"
let icePromise: Promise<{urls: string | string[]; username?: string; credential?: string}[]> | null = null;
let iceFor = '';
let iceStatusValue = '';
function fetchIceServers(db: SupabaseClient, studentId: string) {
  if (iceFor !== studentId) { icePromise = null; iceFor = studentId; }
  if (!icePromise) icePromise = (async () => {
    let r = await authFetch(db, '/api/turn?student=' + encodeURIComponent(studentId), {cache: 'no-store'});
    if (r.status === 401) { await freshToken(db, true).catch(() => ''); r = await authFetch(db, '/api/turn?student=' + encodeURIComponent(studentId), {cache: 'no-store'}); }
    if (!r.ok) { iceStatusValue = 'http_' + r.status; icePromise = null; return []; }
    const j = await r.json().catch(() => ({})) as {iceServers?: unknown; status?: unknown};
    iceStatusValue = typeof j.status === 'string' ? j.status : '';
    const list = Array.isArray(j.iceServers) ? j.iceServers as {urls: string | string[]; username?: string; credential?: string}[] : [];
    if (iceStatusValue !== 'ok') icePromise = null;                                 // ask again next time
    return list;
  })().catch(() => { icePromise = null; iceStatusValue = 'error'; return []; });
  return icePromise;
}
export function createTeacherBridge(db: SupabaseClient, opts: {teacherId: string; userId: string; studentId: string; studentName: string; lessonId?: string | null; lessonStartsAt?: string | null; onSwitch: (id: string) => void}): TeachyBridge {
  let snap: Record<string, string> = {};
  let allowed = new Set<string>();
  let students: StudentRow[] = [];
  const liveUrl = (id: string) => window.location.origin + '/klaslokaal/live?student=' + encodeURIComponent(id);

  async function loadNotes(): Promise<LegacyDb> {
    const s = await db.from('students').select('id,name,level,goals,about,lesson_language').eq('teacher_id', opts.teacherId).order('name');
    if (s.error) throw new Error(s.error.message);
    students = (s.data || []) as StudentRow[];
    allowed = new Set(students.map(x => x.id));
    const ids = students.map(x => x.id);
    const l = ids.length ? await db.from('lesson_entries').select(LESSON_COLS).in('student_id', ids) : {data: [], error: null};
    if (l.error) throw new Error(l.error.message);
    const out = rowsToLegacyDb(students, (l.data || []) as LessonRow[], opts.studentId);
    snap = snapshot(out);
    return out;
  }

  async function saveNotes(next: LegacyDb) {
    if (!allowed.size) await loadNotes();
    const d = diffLegacyDb(snap, next, allowed);
    for (const s of d.students) {
      const r = await db.from('students').update({...s.patch, updated_at: new Date().toISOString()}).eq('id', s.id).eq('teacher_id', opts.teacherId);
      if (r.error) throw new Error(r.error.message);
    }
    if (d.lessons.length) {
      const r = await db.from('lesson_entries').upsert(d.lessons.map(l => ({...l, updated_at: new Date().toISOString()})), {onConflict: 'student_id,lesson_date'});
      if (r.error) throw new Error(r.error.message);
    }
    snap = snapshot(next);
  }

  async function getState(kind: 'board' | 'canvas', id: string | null) {
    if (!id) return null;
    if (!allowed.size) await loadNotes();
    if (!allowed.has(id)) return null;
    const r = await db.from('classroom_states').select(kind).eq('student_id', id).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    return (r.data as Record<string, unknown> | null)?.[kind] ?? null;
  }
  async function putState(kind: 'board' | 'canvas', id: string | null, value: unknown) {
    if (!id) return; // the "general" board without a student is not stored
    if (!allowed.size) await loadNotes();
    if (!allowed.has(id)) return;
    const r = await db.from('classroom_states').upsert({student_id: id, [kind]: value, updated_at: new Date().toISOString(), updated_by: opts.userId}, {onConflict: 'student_id'});
    if (r.error) throw new Error(r.error.message);
  }

  return {
    version: 1, role: 'teacher', studentId: opts.studentId, studentName: opts.studentName, liveUrl: liveUrl(opts.studentId), lessonStartsAt: opts.lessonStartsAt || null, lessonId: opts.lessonId || null,
    async get(key) {
      const k = parseKey(key);
      if (!k) return null;
      if (k.kind === 'notes') return loadNotes();
      return getState(k.kind, k.studentId);
    },
    async put(key, value) {
      const k = parseKey(key);
      if (!k) return;
      if (k.kind === 'notes') return saveNotes(value as LegacyDb);
      return putState(k.kind, k.studentId, value);
    },
    async token(force?: boolean) { return freshToken(db, !!force); }, // v49: renewed when (almost) expired
    async presence(p) {
      // v43: one small RPC about every 30 s while teacher and student are both connected (never per second)
      const r = await db.rpc('lesson_presence', {sid: opts.studentId, skey: p.key, joint: Math.max(0, Math.round(p.joint)), planned: opts.lessonId || null, day: localDate()});
      if (r.error) return /SESSION_EXPIRED/.test(r.error.message) ? {expired: true} : {error: isMissingMigration(r.error) || /lesson_presence/.test(r.error.message) ? 'migration' : r.error.message};
      const d = (r.data || {}) as {registered?: boolean; threshold?: number};
      return {registered: !!d.registered, threshold: d.threshold};
    },
    iceServers: () => fetchIceServers(db, opts.studentId),
    iceStatus: () => iceStatusValue,
    switchStudent(id) { if (allowed.has(id) && id !== opts.studentId) opts.onSwitch(id); },
    async uploadRecording(blob, meta, tracks) {
      const ext = /mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm';
      const day = meta.lessonDate && /^\d{4}-\d{2}-\d{2}$/.test(meta.lessonDate) ? meta.lessonDate : localDate();
      const lessonId = meta.lessonId !== undefined && meta.lessonId !== null ? meta.lessonId : opts.lessonId;
      const stem = `${opts.studentId}/${day}-${crypto.randomUUID()}`;
      const path = `${stem}.${ext}`;
      const type = (blob.type || 'audio/webm').split(';')[0];
      const up = await db.storage.from('recordings').upload(path, blob, {contentType: type, upsert: false});
      if (up.error) return {ok: false, error: up.error.message};
      const ai = !!(meta.aiTeacherAt && meta.aiStudentAt);
      // Separate speaker tracks (only useful for the AI analysis; uploaded only with AI consent).
      const trackPaths: {teacher_track_path?: string; student_track_path?: string} = {};
      if (ai && tracks) for (const who of ['teacher', 'student'] as const) {
        const t = tracks[who]; if (!t || !t.size) continue;
        const p = `${stem}-${who}.${ext}`;
        const u = await db.storage.from('recordings').upload(p, t, {contentType: (t.type || type).split(';')[0], upsert: false});
        if (!u.error) trackPaths[`${who}_track_path`] = p;
      }
      const base = {
        student_id: opts.studentId, storage_path: path, mime_type: type, size_bytes: blob.size,
        duration_seconds: Math.round(meta.durationSeconds), teacher_consent_at: meta.teacherConsentAt,
        student_consent_at: meta.studentConsentAt, created_by: opts.userId,
      };
      let row = await db.from('lesson_recordings').insert({
        ...base, lesson_date: day, ...(lessonId ? {lesson_id: lessonId} : {}),
        ...(ai ? {ai_consent_teacher_at: meta.aiTeacherAt, ai_consent_student_at: meta.aiStudentAt, ...trackPaths} : {}),
      }).select('id').single();
      let v28 = true;
      if (row.error && lessonId && /lesson_id/.test(row.error.message)) row = await db.from('lesson_recordings').insert({...base, lesson_date: day, ...(ai ? {ai_consent_teacher_at: meta.aiTeacherAt, ai_consent_student_at: meta.aiStudentAt, ...trackPaths} : {})}).select('id').single(); // v30 not run yet
      if (row.error && isMissingMigration(row.error)) { v28 = false; row = await db.from('lesson_recordings').insert(base).select('id').single(); } // v28.sql not run yet
      const extra = Object.values(trackPaths);
      if (!v28 && extra.length) await db.storage.from('recordings').remove(extra);
      if (row.error) { await db.storage.from('recordings').remove([path, ...extra]); return {ok: false, error: row.error.message}; }
      if (!ai) return {ok: true};
      if (!v28) return {ok: true, analysis: t('AI-analyse niet gestart: database-update v28 ontbreekt')};
      // Both consented to AI processing: start the server-side analysis (transcription + draft).
      try { await postJson(db, '/api/ai/analyze', {recordingId: row.data.id}); return {ok: true, analysis: 'started'}; }
      catch (e) { return {ok: true, analysis: t('Analyse niet gestart: {0}', e instanceof Error ? e.message : e)}; }
    },
    translate: translator(db),
    ...canvasImages(db, opts.studentId),
    tidy: blocks => postJson(db, '/api/ai/tidy', {studentId: opts.studentId, blocks}),
    // v62: canvas → central word bank (one page or all pages; list = grammar word list of that page)
    vocab: (o: {page?: number | null; list?: boolean}) => postJson(db, '/api/vocab/detect', {studentId: opts.studentId, lessonId: opts.lessonId || null, page: o.page ?? null, list: !!o.list}),
    async previewImport(backup) {
      if (!students.length) await loadNotes();
      return matchBackupStudents(backup as Parameters<typeof matchBackupStudents>[0], students).map(m => ({oldName: m.oldName, newName: m.newName}));
    },
    async importBackup(raw) {
      const backup = raw as {notes?: {students?: {id: string; name: string}[]; lessons?: Record<string, LegacyLesson[]>}; canvas?: Record<string, unknown>; boards?: Record<string, unknown>};
      const current = await loadNotes();
      const matches = matchBackupStudents(backup, students);
      const notes = backup.notes || (backup as unknown as {lessons?: Record<string, LegacyLesson[]>});
      let lessonsAdded = 0, boards = 0, canvases = 0, skipped = 0;
      for (const m of matches) {
        if (!m.newId) { skipped++; continue; }
        const before = current.lessons[m.newId] || [];
        const merged = mergeBackupLessons(before, (notes.lessons || {})[m.oldId] || []);
        lessonsAdded += merged.length - before.length;
        current.lessons[m.newId] = merged;
        for (const [kind, src] of [['board', backup.boards], ['canvas', backup.canvas]] as const) {
          const value = src?.[m.oldId];
          if (!value) continue;
          const existing = await getState(kind, m.newId);
          if (existing) continue; // never overwrite data already stored in Supabase
          await putState(kind, m.newId, value);
          if (kind === 'board') boards++; else canvases++;
        }
      }
      await saveNotes(current);
      return `${lessonsAdded} lessen, ${boards} whiteboards en ${canvases} canvassen geïmporteerd.` + (skipped ? ` ${skipped} leerling(en) uit de back-up niet herkend en overgeslagen.` : '');
    },
  };
}

export function createStudentBridge(db: SupabaseClient, opts: {studentId: string; studentName: string}): TeachyBridge {
  const refuse = async () => { throw new Error(t('Alleen de docent slaat het klaslokaal op')); };
  return {
    version: 1, role: 'student', studentId: opts.studentId, studentName: opts.studentName,
    liveUrl: window.location.origin + '/klaslokaal/live?student=' + encodeURIComponent(opts.studentId),
    get: async () => null, put: refuse,
    async token(force?: boolean) { return freshToken(db, !!force); }, // v49: renewed when (almost) expired
    iceServers: () => fetchIceServers(db, opts.studentId),
    iceStatus: () => iceStatusValue,
    switchStudent() {}, uploadRecording: async () => ({ok: false, error: t('Alleen de docent kan opnames opslaan')}),
    previewImport: async () => [], importBackup: refuse,
    translate: translator(db),
    ...canvasImages(db, opts.studentId),
    tidy: async () => { throw new Error(t('Alleen de docent kan het canvas ordenen')); },
  };
}
