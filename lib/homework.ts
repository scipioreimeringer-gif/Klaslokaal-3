// v44: presentation of homework cards (pure, unit-tested): kind (colour), status, deadline and progress.
// Uses only stored data: the exercise types of the set, published/submitted/feedback timestamps and the optional deadline.

export type HwKind = 'grammatica' | 'woorden' | 'schrijven' | 'lezen' | 'opdracht';
export type HwStatus = 'concept' | 'review' | 'published' | 'submitted' | 'feedback' | 'open' | 'late';
type Item = {type: string};
type A = {published_at: string | null; origin?: string; due_at?: string | null; exercises?: {items?: Item[]} | null};
type S = {submitted_at: string; answer: string; feedback_published_at?: string | null};

const KIND_OF: Record<string, HwKind> = {fill_in: 'grammatica', correct_error: 'grammatica', conjugate: 'grammatica', multiple_choice: 'grammatica',
  translate: 'woorden', write: 'schrijven', make_sentence: 'schrijven', reading: 'lezen'};

/** Most frequent kind of the exercises; a free-text assignment is an "opdracht". */
export function hwKind(ex: A['exercises']): HwKind {
  const n = new Map<HwKind, number>();
  for (const it of ex?.items || []) { const k = KIND_OF[it.type]; if (k) n.set(k, (n.get(k) || 0) + 1); }
  let best: HwKind = 'opdracht', max = 0;
  for (const [k, v] of n) if (v > max) { best = k; max = v; }
  return best;
}

export function hwStatusOf(a: A, subs: S[], teacher: boolean, now = Date.now()): HwStatus {
  const fb = subs.some(s => !!s.feedback_published_at);
  if (teacher) {
    if (!a.published_at) return /^ai/.test(a.origin || '') ? 'review' : 'concept';
    return fb ? 'feedback' : subs.length ? 'submitted' : 'published';
  }
  if (fb) return 'feedback';
  if (subs.length) return 'submitted';
  return a.due_at && Date.parse(a.due_at) < now ? 'late' : 'open';
}

/** Progress 0–100: the automatic score of an interactive set when handed in, else 100 when handed in, 0 when open. */
export function hwProgress(subs: S[]): number {
  if (!subs.length) return 0;
  const m = /Interactief gemaakt: (\d+)\/(\d+)/.exec(subs[0].answer || '');
  return m && +m[2] > 0 ? Math.round((+m[1] / +m[2]) * 100) : 100;
}

/** "Nog 3 dagen" / "Vandaag" / "2 dagen te laat" — whole calendar days, null without a deadline. */
export function dueIn(due: string | null | undefined, now = Date.now()): {days: number} | null {
  if (!due) return null;
  const day = (ms: number) => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60000) / 86400000);
  return {days: day(Date.parse(due)) - day(now)};
}
