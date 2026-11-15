'use client';
import type {SupabaseClient} from '@supabase/supabase-js';
import {progressOf, type LegacyWord} from './classroomMapping';

export type StudentRecord = {
  id: string; teacher_id: string; user_id: string | null; name: string; email: string; subject: string;
  notes: string; goals: string; homework: string; history: string;
  level: string | null; lesson_language: string | null; about: string | null; room_code?: string | null;
  archived_at?: string | null; curriculum_subject?: string | null;
};
export type LessonEntry = {id: string; student_id: string; lesson_date: string; notes: string; homework: string; words: LegacyWord[] | null; updated_at: string};
export type Recording = {id: string; student_id: string; storage_path: string; mime_type: string; size_bytes: number; duration_seconds: number; teacher_consent_at: string; student_consent_at: string; created_at: string};
export type ClassroomState = {board: BoardData | null; canvas: CanvasDoc | null; updated_at: string};
export type BoardObj = {id: string; c: string; p?: number[]; ty?: 'tx'; x?: number; y?: number; txt?: string; w?: number};
export type BoardData = {list: string[]; cur: string; objs: Record<string, BoardObj[]>};
export type CanvasDoc = {pages: {id: string; title: string; html: string}[]; cur: number};

export const STUDENT_COLUMNS_BASE = 'id,teacher_id,user_id,name,email,subject,notes,goals,homework,history';
export const STUDENT_COLUMNS_V27 = STUDENT_COLUMNS_BASE + ',level,lesson_language,about,room_code';
export const STUDENT_COLUMNS_V28 = STUDENT_COLUMNS_V27 + ',archived_at,curriculum_subject';

/** True when an error means "the v27 migration has not been run yet". */
export function isMissingMigration(e: {message?: string; code?: string} | null | undefined) {
  if (!e) return false;
  return e.code === '42P01' || e.code === '42703' || e.code === 'PGRST205' || e.code === 'PGRST204' || /does not exist|could not find|schema cache/i.test(e.message || '');
}
export const MIGRATION_HINT = 'De database-update v27 is nog niet uitgevoerd. Voer supabase/v27.sql uit in de Supabase SQL Editor.';

/** Load students with the v27 columns, falling back to the old columns if v27 is not installed. */
export async function loadStudents(db: SupabaseClient, filter: {teacherId?: string; userId?: string}) {
  const build = (cols: string) => {
    let q = db.from('students').select(cols).order('name');
    if (filter.teacherId) q = q.eq('teacher_id', filter.teacherId);
    if (filter.userId) q = q.eq('user_id', filter.userId);
    return q;
  };
  const r28 = await build(STUDENT_COLUMNS_V28);
  if (!r28.error) return {data: (r28.data || []) as unknown as StudentRecord[], error: null, v27: true, v28: true};
  const r = await build(STUDENT_COLUMNS_V27);
  if (!r.error) return {data: (r.data || []) as unknown as StudentRecord[], error: null, v27: true, v28: false};
  if (!isMissingMigration(r.error)) return {data: [] as StudentRecord[], error: r.error.message, v27: true, v28: false};
  const old = await build(STUDENT_COLUMNS_BASE);
  return {data: (old.data || []) as unknown as StudentRecord[], error: old.error?.message || null, v27: false, v28: false};
}

export async function loadStudentBundle(db: SupabaseClient, studentId: string) {
  const [lessons, recordings, assignments, state] = await Promise.all([
    db.from('lesson_entries').select('id,student_id,lesson_date,notes,homework,words,updated_at').eq('student_id', studentId).order('lesson_date', {ascending: false}),
    db.from('lesson_recordings').select('id,student_id,storage_path,mime_type,size_bytes,duration_seconds,teacher_consent_at,student_consent_at,created_at').eq('student_id', studentId).order('created_at', {ascending: false}),
    db.from('assignments').select('id,published_at').eq('student_id', studentId),
    db.from('classroom_states').select('board,canvas,updated_at').eq('student_id', studentId).maybeSingle(),
  ]);
  const ids = (assignments.data || []).map(a => a.id as string);
  const subs = ids.length ? await db.from('homework_submissions').select('assignment_id').in('assignment_id', ids) : {data: [] as {assignment_id: string}[], error: null};
  const missing = isMissingMigration(lessons.error) || isMissingMigration(recordings.error) || isMissingMigration(state.error);
  const L = (lessons.data || []) as LessonEntry[];
  return {
    missing,
    error: missing ? MIGRATION_HINT : (lessons.error?.message || recordings.error?.message || state.error?.message || null),
    lessons: L,
    recordings: (recordings.data || []) as Recording[],
    state: (state.data || null) as ClassroomState | null,
    progress: progressOf(L, (assignments.data || []) as {published_at: string | null}[], (subs.data || []) as {assignment_id: string}[]),
  };
}

export function allWords(lessons: LessonEntry[]) {
  const seen = new Map<string, {nl: string; uit: string; date: string}>();
  for (const l of lessons) for (const w of l.words || []) {
    const k = (w.nl || '').trim().toLowerCase();
    if (k && !seen.has(k)) seen.set(k, {nl: w.nl, uit: w.uit || '', date: l.lesson_date});
  }
  return Array.from(seen.values());
}

export async function recordingUrl(db: SupabaseClient, path: string) {
  const {data, error} = await db.storage.from('recordings').createSignedUrl(path, 600);
  return error ? {url: null, error: error.message} : {url: data.signedUrl, error: null};
}

export async function deleteRecording(db: SupabaseClient, r: Recording) {
  const del = await db.from('lesson_recordings').delete().eq('id', r.id).select('id');
  if (del.error) return del.error.message;
  if (!del.data?.length) return 'Geen toestemming om deze opname te verwijderen.';
  const file = await db.storage.from('recordings').remove([r.storage_path]);
  return file.error ? 'Opname-gegevens verwijderd, maar het bestand kon niet worden gewist: ' + file.error.message : null;
}

export const niceDate = (iso: string) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('nl-NL', {weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'});
export const duration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
