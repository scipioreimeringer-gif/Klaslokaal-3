// Pure helpers for practice (no imports, unit-tested).

/** Normalised answer comparison: exact (case/spaces/end-punctuation ignored), accent-only difference, or wrong. */
export function checkText(given: string, answers: string[]): 'correct' | 'accent' | 'wrong' {
  const norm = (s: string) => String(s || '').trim().toLowerCase().replace(/[.!?;:,"“”'’]+$/g, '').replace(/\s+/g, ' ');
  const plain = (s: string) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const g = norm(given);
  if (!g) return 'wrong';
  const list = answers.filter(a => norm(a));
  if (list.some(a => norm(a) === g)) return 'correct';
  if (list.some(a => plain(a) === plain(g))) return 'accent';
  return 'wrong';
}

/** Order practice items: due first (oldest due date), then new, then the rest; stable and deterministic. */
export function practiceOrder<T extends {due_at: string; status: string; wrong_count: number}>(items: T[], now = Date.now()): T[] {
  const due = (x: T) => new Date(x.due_at).getTime() <= now;
  return items.slice().sort((a, b) =>
    Number(due(b)) - Number(due(a)) ||
    (a.status === 'mastered' ? 1 : 0) - (b.status === 'mastered' ? 1 : 0) ||
    b.wrong_count - a.wrong_count ||
    new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
}

/** Multiple-choice options: the correct one plus up to 3 distinct distractors, shuffled with a seed. */
export function mcOptions(correct: string, pool: string[], seed: number): string[] {
  const uniq = Array.from(new Set(pool.filter(p => p && p.toLowerCase() !== correct.toLowerCase())));
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const distract: string[] = [];
  while (uniq.length && distract.length < 3) distract.push(uniq.splice(Math.floor(rnd() * uniq.length), 1)[0]);
  const all = [correct, ...distract];
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all;
}

/** Practice sessions per ISO week (last n weeks), counting sessions. */
export function sessionsPerWeek(sessions: {created_at: string}[], n = 8, now = new Date()) {
  const monday = (d: Date) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day); return x; };
  const start = monday(now);
  const out: {key: string; label: string; value: number}[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const w = new Date(start); w.setUTCDate(start.getUTCDate() - 7 * i);
    const end = new Date(w); end.setUTCDate(w.getUTCDate() + 7);
    out.push({key: w.toISOString().slice(0, 10), label: `${w.getUTCDate()}/${w.getUTCMonth() + 1}`, value: sessions.filter(s => { const t = new Date(s.created_at); return t >= w && t < end; }).length});
  }
  return out;
}
