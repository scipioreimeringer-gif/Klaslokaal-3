// v68: which grammar the practice games and the daily practice should stress, from the personal learning line
// (Dutch NT2 or Brazilian Portuguese): topics in development / extra practice and recent lesson topics get more
// attention; mastered topics stay "known" (they keep coming back now and then). Plain queries, no AI.
import type {SupabaseClient} from '@supabase/supabase-js';
import {topicInfo} from './topics.ts';

type Row = {status?: string; outcome?: string; curriculum_goals: {code: string | null} | null};
export function focusKeys(progress: Row[], lessonGoals: Row[]): {focus: string[]; known: string[]} {
  const keys = (r: Row) => topicInfo(r.curriculum_goals?.code)?.keys || [];
  const focus = new Set<string>(), known = new Set<string>();
  for (const r of progress) {
    if (r.status === 'in_progress' || r.status === 'covered' || r.status === 'review') keys(r).forEach(k => { focus.add(k); known.add(k); });
    else if (r.status === 'mastered') keys(r).forEach(k => known.add(k));
  }
  for (const r of lessonGoals) if (r.outcome !== 'not_covered') keys(r).forEach(k => { focus.add(k); known.add(k); });
  return {focus: [...focus], known: [...known]};
}
export async function focusKeysOf(db: SupabaseClient, studentId: string) {
  const since = new Date(Date.now() - 21 * 86400e3).toISOString().slice(0, 10);
  const [p, l] = await Promise.all([
    db.from('student_goal_progress').select('status,curriculum_goals(code)').eq('student_id', studentId),
    db.from('lesson_goals').select('outcome,curriculum_goals(code)').eq('student_id', studentId).gte('lesson_date', since),
  ]);
  return focusKeys((p.error ? [] : p.data || []) as unknown as Row[], (l.error ? [] : l.data || []) as unknown as Row[]);
}
