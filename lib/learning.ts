'use client';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {AnalysisDoc, AnalysisStatus} from './analysisTypes';

export type VocabItem = {id: string; student_id: string; term: string; translation: string; example: string; kind: 'word' | 'expression'; status: 'new' | 'practicing' | 'mastered'; source: 'teacher' | 'lesson' | 'ai' | 'student'; lesson_date: string | null; correct_count: number; wrong_count: number; streak: number; due_at: string; last_practiced_at: string | null};
export type Goal = {id: string; code: string | null; subject: string; level: string; skill: string; title: string; description: string; sort: number; owner_teacher: string | null};
export type GoalStatus = 'not_started' | 'in_progress' | 'covered' | 'mastered';
export type GoalProgress = {student_id: string; goal_id: string; status: GoalStatus; basis: 'teacher' | 'ai_confirmed' | 'practice'; note: string; lesson_date: string | null; updated_at: string};
export type AnalysisRow = {id: string; student_id: string; recording_id: string | null; lesson_date: string; status: AnalysisStatus; transcript: string | null; source_quality: string; draft: AnalysisDoc | null; final: AnalysisDoc | null; error: string | null; approved_at: string | null; created_at: string};
export type PracticeSession = {id: string; kind: string; score: number; total: number; duration_seconds: number; assignment_id: string | null; created_at: string};

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {not_started: 'Nog niet behandeld', in_progress: 'Mee bezig', covered: 'Behandeld', mastered: 'Beheerst'};
export const SKILLS = ['woordenschat', 'grammatica', 'spreken', 'luisteren', 'lezen', 'schrijven', 'overig'] as const;
export const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const SUBJECTS: Record<string, string> = {nl: 'Nederlands', pt: 'Portugees'};
export const VOCAB_STATUS_LABEL = {new: 'Nieuw', practicing: 'Aan het oefenen', mastered: 'Beheerst'} as const;

/** Same rule as the server (lib/server/context.ts). */
export function subjectOf(s: {curriculum_subject?: string | null; subject?: string | null; lesson_language?: string | null}) {
  if (s.curriculum_subject) return s.curriculum_subject;
  if (/portug/i.test(s.subject || '')) return 'pt';
  if (/nederl|dutch|nt2/i.test(s.subject || '')) return 'nl';
  return s.lesson_language || 'nl';
}

export async function authedPost<T>(db: SupabaseClient, path: string, body: unknown): Promise<T> {
  const {data} = await db.auth.getSession();
  const r = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + (data.session?.access_token || '')}, body: JSON.stringify(body)});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as {error?: string}).error || 'Fout ' + r.status);
  return j as T;
}

export async function loadVocab(db: SupabaseClient, studentId: string) {
  const r = await db.from('vocab_items').select('*').eq('student_id', studentId).order('created_at', {ascending: false});
  return {items: (r.data || []) as VocabItem[], error: r.error?.message || null};
}

/** Insert words, skipping ones already in the list (case-insensitive unique index). */
export async function addVocab(db: SupabaseClient, studentId: string, words: {term: string; translation: string; example?: string; kind?: 'word' | 'expression'}[], source: VocabItem['source'], lessonDate?: string | null) {
  let added = 0, skipped = 0;
  for (const w of words) {
    const term = w.term.trim(); if (!term) continue;
    const r = await db.from('vocab_items').insert({student_id: studentId, term, translation: w.translation.trim(), example: (w.example || '').trim(), kind: w.kind || (term.includes(' ') ? 'expression' : 'word'), source, lesson_date: lessonDate || null});
    if (r.error) skipped++; else added++;
  }
  return {added, skipped};
}

/** Approve an AI analysis: final version visible to the student, chosen words → vocabulary, chosen goals → progress. */
export async function approveAnalysis(db: SupabaseClient, a: AnalysisRow, final: AnalysisDoc, goals: {code: string; status: Exclude<GoalStatus, 'mastered' | 'not_started'>}[], userId: string) {
  const vocab = await addVocab(db, a.student_id, final.vocabulary, 'ai', a.lesson_date);
  let goalsSaved = 0;
  if (goals.length) {
    const {data: rows} = await db.from('curriculum_goals').select('id,code').in('code', goals.map(g => g.code));
    for (const g of goals) {
      const id = (rows || []).find(r => r.code === g.code)?.id; if (!id) continue;
      const cur = await db.from('student_goal_progress').select('status').eq('student_id', a.student_id).eq('goal_id', id).maybeSingle();
      if (cur.data?.status === 'mastered' || (cur.data?.status === 'covered' && g.status === 'in_progress')) continue; // never lower a teacher's judgement
      const r = await db.from('student_goal_progress').upsert({student_id: a.student_id, goal_id: id, status: g.status, basis: 'ai_confirmed', lesson_date: a.lesson_date, updated_at: new Date().toISOString()}, {onConflict: 'student_id,goal_id'});
      if (!r.error) goalsSaved++;
    }
  }
  const r = await db.from('lesson_analyses').update({status: 'approved', final, approved_by: userId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString()}).eq('id', a.id);
  if (r.error) throw new Error(r.error.message);
  return {vocab, goalsSaved};
}

/** Retention: remove this teacher's recordings and analyses past their expiry date (default 12 months). */
export async function purgeExpired(db: SupabaseClient) {
  const now = new Date().toISOString();
  const recs = await db.from('lesson_recordings').select('id,storage_path,teacher_track_path,student_track_path').lt('expires_at', now).limit(50);
  if (recs.error || !recs.data?.length) { await db.from('lesson_analyses').delete().lt('expires_at', now); return 0; }
  await db.storage.from('recordings').remove(recs.data.flatMap(r => [r.storage_path, r.teacher_track_path, r.student_track_path]).filter(Boolean) as string[]);
  await db.from('lesson_recordings').delete().in('id', recs.data.map(r => r.id));
  await db.from('lesson_analyses').delete().lt('expires_at', now);
  return recs.data.length;
}

export {checkText} from './answers';
