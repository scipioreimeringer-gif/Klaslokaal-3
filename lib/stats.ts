// Pure dashboard statistics, computed ONLY from stored rows. No imports so
// Node can unit-test it directly. Nothing here invents or estimates values.

export type LessonLike = {student_id: string; lesson_date: string; words?: unknown};
export type Point = {key: string; label: string; value: number};

const MONTHS_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** The last `n` calendar months ending with the month of `now`, as YYYY-MM keys. */
export function lastMonths(n: number, now = new Date()): {key: string; label: string}[] {
  const out: {key: string; label: string}[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    out.push({key, label: MONTHS_NL[d.getUTCMonth()] + (d.getUTCMonth() === 0 ? ' ' + String(d.getUTCFullYear()).slice(2) : '')});
  }
  return out;
}

const wordCount = (w: unknown) => (Array.isArray(w) ? w.length : 0);

/** Number of lessons per month for the last n months. */
export function lessonsPerMonth(lessons: LessonLike[], n = 6, now = new Date()): Point[] {
  return lastMonths(n, now).map(m => ({...m, value: lessons.filter(l => l.lesson_date.startsWith(m.key)).length}));
}

/** New words recorded per month for the last n months. */
export function wordsPerMonth(lessons: LessonLike[], n = 6, now = new Date()): Point[] {
  return lastMonths(n, now).map(m => ({...m, value: lessons.filter(l => l.lesson_date.startsWith(m.key)).reduce((s, l) => s + wordCount(l.words), 0)}));
}

/** Running total of words (all lessons before the window are included in the first point). */
export function cumulativeWords(lessons: LessonLike[], n = 6, now = new Date()): Point[] {
  const months = lastMonths(n, now);
  const first = months[0].key;
  let total = lessons.filter(l => l.lesson_date.slice(0, 7) < first).reduce((s, l) => s + wordCount(l.words), 0);
  return wordsPerMonth(lessons, n, now).map(p => ({...p, value: (total += p.value)}));
}

/** Homework: published assignments vs. those with at least one submission. */
export function homeworkProgress(assignments: {id: string; published_at: string | null}[], submissions: {assignment_id: string}[]) {
  const published = assignments.filter(a => a.published_at);
  const done = new Set(submissions.map(s => s.assignment_id));
  const submitted = published.filter(a => done.has(a.id)).length;
  return {published: published.length, submitted, open: published.length - submitted, pct: published.length ? Math.round((submitted / published.length) * 100) : null};
}

/** Lessons grouped by a label (subject, student name …), largest first; empty labels become "Overig". */
export function groupCount(lessons: LessonLike[], labelOf: (studentId: string) => string, limit = 6): Point[] {
  const m = new Map<string, number>();
  for (const l of lessons) {
    const k = (labelOf(l.student_id) || '').trim() || 'Overig';
    m.set(k, (m.get(k) || 0) + 1);
  }
  const sorted = Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const head = sorted.slice(0, limit).map(([k, v]) => ({key: k, label: k, value: v}));
  const rest = sorted.slice(limit).reduce((s, [, v]) => s + v, 0);
  if (rest) head.push({key: '__other', label: 'Overig', value: rest});
  return head;
}

/** Active students: distinct students with a lesson in the last `days` days. */
export function activeStudents(lessons: LessonLike[], days = 30, now = new Date()) {
  const from = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  return new Set(lessons.filter(l => l.lesson_date >= from).map(l => l.student_id)).size;
}

export const isEmptySeries = (p: Point[]) => p.every(x => x.value === 0);
