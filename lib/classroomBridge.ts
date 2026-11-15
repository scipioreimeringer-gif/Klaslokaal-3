'use client';
import type {SupabaseClient} from '@supabase/supabase-js';
import {isMissingMigration} from './data';
import {diffLegacyDb,matchBackupStudents,mergeBackupLessons,parseKey,rowsToLegacyDb,snapshot,type LegacyDb,type LegacyLesson,type LessonRow,type StudentRow} from './classroomMapping';

/**
 * The bridge the existing live classroom (public/legacy/index.html, loaded in a
 * same-origin iframe) calls instead of the old password-protected Redis API.
 * Every read and write goes through the logged-in user's Supabase session, so
 * Row Level Security decides what is allowed — never the iframe.
 */
export type TeachyBridge = {
  version: 1;
  role: 'teacher' | 'student';
  studentId: string;
  studentName: string;
  liveUrl: string;
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  token(): Promise<string>;
  switchStudent(id: string): void;
  uploadRecording(blob: Blob, meta: {durationSeconds: number; teacherConsentAt: string; studentConsentAt: string; aiTeacherAt?: string | null; aiStudentAt?: string | null}): Promise<{ok: boolean; error?: string; analysis?: string}>;
  previewImport(backup: unknown): Promise<{oldName: string; newName: string | null}[]>;
  importBackup(backup: unknown): Promise<string>;
  /** Personal hover translation (never written to the shared canvas). */
  translate(term: string, context: string): Promise<TranslateResult>;
  /** Teacher only: AI proposal for a tidier canvas page (preview first, nothing is written). */
  tidy(blocks: {t: string; text: string}[]): Promise<{blocks: {type: 'h' | 'p' | 'li'; text: string}[]; changes: string[]}>;
};
export type TranslateResult = {translation: string; expression: string | null; expression_translation: string | null; note: string; target: string};

async function postJson<T>(db: SupabaseClient, path: string, body: unknown): Promise<T> {
  const {data} = await db.auth.getSession();
  const r = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + (data.session?.access_token || '')}, body: JSON.stringify(body)});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as {error?: string}).error || 'Fout ' + r.status);
  return j as T;
}
const translateCache = new Map<string, Promise<TranslateResult>>();
function translator(db: SupabaseClient) {
  return (term: string, context: string) => {
    const k = term.toLowerCase() + '\u0000' + context.toLowerCase();
    if (!translateCache.has(k)) {
      const p = postJson<TranslateResult>(db, '/api/ai/translate', {term, context});
      p.catch(() => translateCache.delete(k));
      translateCache.set(k, p);
    }
    return translateCache.get(k)!;
  };
}

declare global { interface Window { teachyBridge?: TeachyBridge } }

const LESSON_COLS = 'student_id,lesson_date,notes,homework,words,sorted';

export function createTeacherBridge(db: SupabaseClient, opts: {teacherId: string; userId: string; studentId: string; studentName: string; onSwitch: (id: string) => void}): TeachyBridge {
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
    version: 1, role: 'teacher', studentId: opts.studentId, studentName: opts.studentName, liveUrl: liveUrl(opts.studentId),
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
    async token() { const {data} = await db.auth.getSession(); return data.session?.access_token || ''; },
    switchStudent(id) { if (allowed.has(id) && id !== opts.studentId) opts.onSwitch(id); },
    async uploadRecording(blob, meta) {
      const ext = /mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm';
      const path = `${opts.studentId}/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}.${ext}`;
      const type = (blob.type || 'audio/webm').split(';')[0];
      const up = await db.storage.from('recordings').upload(path, blob, {contentType: type, upsert: false});
      if (up.error) return {ok: false, error: up.error.message};
      const ai = !!(meta.aiTeacherAt && meta.aiStudentAt);
      const base = {
        student_id: opts.studentId, storage_path: path, mime_type: type, size_bytes: blob.size,
        duration_seconds: Math.round(meta.durationSeconds), teacher_consent_at: meta.teacherConsentAt,
        student_consent_at: meta.studentConsentAt, created_by: opts.userId,
      };
      let row = await db.from('lesson_recordings').insert({
        ...base, lesson_date: new Date().toISOString().slice(0, 10),
        ...(ai ? {ai_consent_teacher_at: meta.aiTeacherAt, ai_consent_student_at: meta.aiStudentAt} : {}),
      }).select('id').single();
      let v28 = true;
      if (row.error && isMissingMigration(row.error)) { v28 = false; row = await db.from('lesson_recordings').insert(base).select('id').single(); } // v28.sql not run yet
      if (row.error) { await db.storage.from('recordings').remove([path]); return {ok: false, error: row.error.message}; }
      if (!ai) return {ok: true};
      if (!v28) return {ok: true, analysis: 'AI-analyse niet gestart: database-update v28 ontbreekt'};
      // Both consented to AI processing: start the server-side analysis (transcription + draft).
      try { await postJson(db, '/api/ai/analyze', {recordingId: row.data.id}); return {ok: true, analysis: 'started'}; }
      catch (e) { return {ok: true, analysis: 'Analyse niet gestart: ' + (e instanceof Error ? e.message : e)}; }
    },
    translate: translator(db),
    tidy: blocks => postJson(db, '/api/ai/tidy', {studentId: opts.studentId, blocks}),
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
  const refuse = async () => { throw new Error('Alleen de docent slaat het klaslokaal op'); };
  return {
    version: 1, role: 'student', studentId: opts.studentId, studentName: opts.studentName,
    liveUrl: window.location.origin + '/klaslokaal/live?student=' + encodeURIComponent(opts.studentId),
    get: async () => null, put: refuse,
    async token() { const {data} = await db.auth.getSession(); return data.session?.access_token || ''; },
    switchStudent() {}, uploadRecording: async () => ({ok: false, error: 'Alleen de docent kan opnames opslaan'}),
    previewImport: async () => [], importBackup: refuse,
    translate: translator(db),
    tidy: async () => { throw new Error('Alleen de docent kan het canvas ordenen'); },
  };
}
