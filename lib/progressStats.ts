// v73: personal statistics — pure functions over stored data (no AI, no estimates). Used by the student's Voortgang page,
// the dashboard summary and the teacher's student profile, so every place shows the SAME numbers.
// Rule: a number is only shown when it is measured; otherwise the caller shows "nog niet gemeten".
import {lastMonths, type Point} from './stats.ts';

export type Period = 'week' | 'month' | 'all';
const DAY = 86400e3;
export function periodStart(p: Period, now = Date.now()): number {
  if (p === 'all') return 0;
  if (p === 'week') return now - 7 * DAY;
  const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
const inP = (iso: string | null | undefined, from: number) => !!iso && Date.parse(iso.length === 10 ? iso + 'T12:00:00' : iso) >= from;

export type LessonRow = {lesson_date: string; session?: {joint_seconds: number} | null};
/** Lessons followed; minutes only from measured classroom time (older lessons without a measurement add no minutes). */
export function lessonStats(lessons: LessonRow[], p: Period, now = Date.now()) {
  const from = periodStart(p, now), month = periodStart('month', now);
  const list = lessons.filter(l => inP(l.lesson_date, from));
  const measured = list.filter(l => l.session && l.session.joint_seconds > 0);
  const minutes = Math.round(measured.reduce((n, l) => n + l.session!.joint_seconds, 0) / 60);
  return {count: list.length, thisMonth: lessons.filter(l => inP(l.lesson_date, month)).length, minutes, measured: measured.length,
    avgMinutes: measured.length ? Math.round(minutes / measured.length) : null};
}

export type PracticeRow = {created_at: string; score: number; total: number; kind: string; details?: {day?: string} | null};
export function practiceStats(rows: PracticeRow[], p: Period, now = Date.now()) {
  const list = rows.filter(r => inP(r.created_at, periodStart(p, now)));
  const answered = list.reduce((n, r) => n + Math.max(0, r.total || 0), 0), correct = list.reduce((n, r) => n + Math.max(0, r.score || 0), 0);
  return {sessions: list.length, answered, correct, pct: answered ? Math.round(correct / answered * 100) : null};
}
/** Current and longest run of consecutive practice days (any practice, one per day). */
export function streaks(days: string[], today: string) {
  const set = [...new Set(days.filter(Boolean))].sort();
  let longest = 0, run = 0, prev = '';
  const next = (d: string) => new Date(Date.parse(d + 'T12:00:00Z') + DAY).toISOString().slice(0, 10);
  for (const d of set) { run = prev && next(prev) === d ? run + 1 : 1; longest = Math.max(longest, run); prev = d; }
  const has = new Set(set); let cur = 0, d = has.has(today) ? today : new Date(Date.parse(today + 'T12:00:00Z') - DAY).toISOString().slice(0, 10);
  while (has.has(d)) { cur++; d = new Date(Date.parse(d + 'T12:00:00Z') - DAY).toISOString().slice(0, 10); }
  return {current: cur, longest};
}

export type VocabRow = {status: string; created_at?: string | null; last_practiced_at?: string | null; due_at?: string | null; difficult?: boolean | null};
/** "In the word bank" ≠ "learned": practised = really practised at least once; mastered = status mastered (spaced repetition). */
export function vocabStats(v: VocabRow[], p: Period, now = Date.now()) {
  const from = periodStart(p, now);
  return {total: v.length, added: v.filter(x => inP(x.created_at, from)).length, practised: v.filter(x => !!x.last_practiced_at).length,
    mastered: v.filter(x => x.status === 'mastered').length,
    review: v.filter(x => x.status !== 'mastered' && (!!x.difficult || (!!x.last_practiced_at && !!x.due_at && Date.parse(x.due_at) <= now))).length};
}

export function homeworkStats(assignments: {id: string; published_at: string | null}[], submitted: string[]) {
  const pub = assignments.filter(a => a.published_at); const done = new Set(submitted);
  const finished = pub.filter(a => done.has(a.id)).length;
  return {assigned: pub.length, done: finished, open: pub.length - finished};
}

/** Official statuses are the teacher's (v64: In ontwikkeling · Extra oefenen · Beheerst; older "covered" = in development). */
export function grammarStats(progress: {status: string}[], _focus: {status: string}[] = []) {
  return {covered: progress.filter(x => x.status === 'covered' || x.status === 'in_progress' || x.status === 'review' || x.status === 'mastered').length,
    mastered: progress.filter(x => x.status === 'mastered').length, developing: progress.filter(x => x.status === 'in_progress' || x.status === 'covered').length,
    extra: progress.filter(x => x.status === 'review').length};
}

/* ---------------- series for the charts ---------------- */
function weekStart(t: number) { const d = new Date(t); const k = (d.getDay() + 6) % 7; return new Date(d.getFullYear(), d.getMonth(), d.getDate() - k).getTime(); }
export function lastWeeks(n: number, now = Date.now()) {
  const w0 = weekStart(now); return Array.from({length: n}, (_, i) => { const t = w0 - (n - 1 - i) * 7 * DAY; const d = new Date(t); return {start: t, key: d.toISOString().slice(0, 10), label: d.getDate() + '/' + (d.getMonth() + 1)}; });
}
export function perWeek<T>(rows: T[], dateOf: (r: T) => string, valueOf: (r: T) => number, n = 8, now = Date.now()): Point[] {
  const w = lastWeeks(n, now);
  return w.map((x, i) => ({key: x.key, label: x.label, value: rows.filter(r => { const t = Date.parse(dateOf(r)); return t >= x.start && t < (w[i + 1]?.start ?? Infinity); }).reduce((s, r) => s + valueOf(r), 0)}));
}
/** Correct answers in % per week; weeks without answers stay empty (null → 0 with an "unmeasured" flag in the table). */
export function correctPerWeek(rows: PracticeRow[], n = 8, now = Date.now()): Point[] {
  const a = perWeek(rows, r => r.created_at, r => r.total || 0, n, now), c = perWeek(rows, r => r.created_at, r => r.score || 0, n, now);
  return a.map((x, i) => ({...x, value: x.value ? Math.round(c[i].value / x.value * 100) : 0}));
}
export function perMonth<T>(rows: T[], dateOf: (r: T) => string | null | undefined, valueOf: (r: T) => number, n = 6, now = new Date()): Point[] {
  return lastMonths(n, now).map(m => ({key: m.key, label: m.label, value: rows.filter(r => (dateOf(r) || '').slice(0, 7) === m.key).reduce((s, r) => s + valueOf(r), 0)}));
}
/** Word bank size at the end of each month (words without a creation date count from the start). */
export function wordGrowth(v: VocabRow[], n = 6, now = new Date()): Point[] {
  return lastMonths(n, now).map(m => ({key: m.key, label: m.label, value: v.filter(x => !x.created_at || x.created_at.slice(0, 7) <= m.key).length}));
}
