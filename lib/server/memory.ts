import 'server-only';
// v60: write a published lesson report into the student's AI memory (no AI call: it reuses the analysis output).
import type {SupabaseClient} from '@supabase/supabase-js';
import {mergeReport, type Pattern, type ReportLike} from '../memory/merge';

const COLS = 'kind,key,label,error_type,status,confidence,lessons_seen,occurrences,uncertain,slips,clean_lessons,examples,history,first_seen,last_seen,last_clean,hidden,teacher_status,teacher_note';

/** Idempotent: a report that was applied before is skipped by the database. Never throws (memory is extra). */
export async function applyMemory(db: SupabaseClient, studentId: string, analysisId: string, lessonDate: string, doc: ReportLike): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [pat, mem] = await Promise.all([
      db.from('memory_patterns').select(COLS).eq('student_id', studentId),
      db.from('student_memory').select('version').eq('student_id', studentId).maybeSingle(),
    ]);
    if (pat.error) return /memory_patterns/.test(pat.error.message) ? 'migration' : 'error';
    const {changed, profile} = mergeReport((pat.data || []) as Pattern[], doc, {analysis_id: analysisId, lesson_date: lessonDate});
    const patterns = changed.map(({hidden: _h, teacher_status: _s, teacher_note: _n, ...p}) => p);   // teacher fields stay the teacher's
    const r = await db.rpc('memory_apply', {p_student: studentId, p_analysis: analysisId, p_lesson_date: lessonDate,
      p_base_version: (mem.data as {version?: number} | null)?.version || 0, p_patterns: patterns, p_profile: profile});
    if (!r.error) return String(r.data);
    if (!/STALE/.test(r.error.message)) return 'error';                          // someone else updated meanwhile → re-read
  }
  return 'busy';
}

/** Catch up: published reports of this student that are not in the memory yet, oldest first (max `limit`). */
export async function catchUpMemory(db: SupabaseClient, studentId: string, limit = 12) {
  const [done, list] = await Promise.all([
    db.from('memory_sources').select('analysis_id').eq('student_id', studentId),
    db.from('lesson_analyses').select('id,lesson_date,final,is_test').eq('student_id', studentId).eq('status', 'approved').order('lesson_date', {ascending: true}).limit(200),
  ]);
  if (done.error) return {applied: 0, migration: /memory_sources/.test(done.error.message)};
  const seen = new Set(((done.data || []) as {analysis_id: string}[]).map(d => d.analysis_id));
  let applied = 0;
  for (const a of ((list.data || []) as {id: string; lesson_date: string; final: ReportLike & {version?: number} | null; is_test?: boolean}[])) {
    if (applied >= limit) break;
    if (seen.has(a.id) || a.is_test || !a.final || a.final.version !== 2) continue;
    if ((await applyMemory(db, studentId, a.id, a.lesson_date, a.final)) === 'applied') applied++;
  }
  return {applied, migration: false};
}
