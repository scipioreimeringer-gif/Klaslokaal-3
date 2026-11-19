// v43: one card per registered lesson (pure, unit-tested). Links each lesson to its own AI report without AI calls.
import {mergeLessons, type LessonLike, type SessionLike} from './stats.ts';

export type CardAnalysis = {id: string; lesson_date: string; status: string; recording_id?: string | null; final?: unknown};
export type LessonCard = {
  key: string; number: number; date: string; minutes: number | null; words: number; errors: number | null;
  recording: boolean; analysis: CardAnalysis | null; status: 'none' | 'queued' | 'processing' | 'ready' | 'approved' | 'failed';
  language: string | null; legacy: boolean; startedAt: string | null;
};

/** Certain errors in a report (v2: examples per category; v1: corrections). Uncertain ones are never counted. */
export function errorCount(final: unknown): number | null {
  if (!final || typeof final !== 'object') return null;
  const f = final as {version?: number; categories?: {examples?: {certainty?: string}[]}[]; corrections?: {certainty?: string}[]};
  if (f.version === 2) return (f.categories || []).reduce((n, c) => n + (c.examples || []).filter(e => e.certainty !== 'uncertain').length, 0);
  return Array.isArray(f.corrections) ? f.corrections.filter(c => c.certainty !== 'uncertain').length : null;
}

/**
 * Cards newest first, numbered in chronological order ("Les 12").
 * Report link: the analysis of the recording made during that session; otherwise the analysis of that lesson day,
 * given only to the last lesson of the day (two lessons on one day never show the same report twice).
 */
export function lessonCards(entries: LessonLike[], sessions: SessionLike[] | null, analyses: CardAnalysis[], recordings: {id: string; created_at: string}[] = []): LessonCard[] {
  const merged = mergeLessons(entries, sessions);
  const used = new Set<string>();
  const byRec = new Map(analyses.filter(a => a.recording_id).map(a => [a.recording_id as string, a]));
  // pass 1: exact recording links
  const exact = merged.map(m => { const a = m.session?.recording_id ? byRec.get(m.session.recording_id) || null : null; if (a) used.add(a.id); return a; });
  const lastOfDay = new Map<string, number>();
  merged.forEach((m, i) => lastOfDay.set(m.student_id + '|' + m.lesson_date, i));
  const cards = merged.map((m, i): LessonCard => {
    let a = exact[i];
    if (!a && lastOfDay.get(m.student_id + '|' + m.lesson_date) === i) {
      a = analyses.find(x => x.lesson_date === m.lesson_date && !used.has(x.id) && (!x.recording_id || !merged.some(o => o.session?.recording_id === x.recording_id))) || null;
      if (a) used.add(a.id);
    }
    const s = m.session;
    return {
      key: s ? s.id : 'day-' + m.student_id + '-' + m.lesson_date, number: i + 1, date: m.lesson_date,
      minutes: s ? Math.max(1, Math.round(s.joint_seconds / 60)) : null,
      words: Array.isArray(m.words) ? m.words.length : 0,
      errors: a && a.status === 'approved' ? errorCount(a.final) : a && a.status === 'ready' ? errorCount(a.final) : null,
      recording: s ? !!s.recording_id : recordings.some(r => r.created_at.slice(0, 10) === m.lesson_date),
      analysis: a, status: (a?.status as LessonCard['status']) || 'none', language: s?.language || null, legacy: !!m.legacy, startedAt: s?.started_at || null,
    };
  });
  return cards.reverse();
}
