// v76: the daily learning route — pure planning (unit-tested). One route per relation (= learning language) and local
// calendar day: round 1 is the personal daily challenge (10 questions, keeps the streak), the other rounds open the
// EXISTING games with a frozen, small deck. A game without enough reliable items is replaced, never forced.
export type RoundKind = 'daily' | 'flashcards' | 'conjugate' | 'match' | 'sentence' | 'errors' | 'typing' | 'quiz';
export const ROUTE_DEFAULT: [RoundKind, number][] = [['daily', 10], ['flashcards', 5], ['conjugate', 5], ['match', 5], ['sentence', 3], ['errors', 3]];
const ALTERNATIVES: RoundKind[] = ['typing', 'quiz', 'flashcards', 'sentence', 'conjugate'];
export const ROUND_LABEL: Record<RoundKind, string> = {daily: 'Dagelijkse uitdaging', flashcards: 'Flashcards', conjugate: 'Werkwoorden vervoegen', match: 'Woorden koppelen', sentence: 'Zinnen aanvullen', errors: 'Fouten verbeteren', typing: 'Vertaalspel', quiz: 'Meerkeuzequiz'};
/** Minimum items for a meaningful round (match needs at least 3 pairs; MC quiz 4 options). */
const MIN: Record<RoundKind, number> = {daily: 1, flashcards: 3, conjugate: 3, match: 3, sentence: 2, errors: 2, typing: 3, quiz: 4};

export type Round = {kind: RoundKind; n: number; items: unknown[] | null};
export type RouteState = {v: 1; day: string; rounds: Round[]; cur: number; pos: number; res: {score: number; total: number; xp: number}[]; done: boolean};

/** Plan today's rounds from the items that are really available (frozen copies of the decks are stored with the route). */
export function planRoute(day: string, avail: Partial<Record<RoundKind, unknown[]>>, o: {level?: string; mixed?: boolean} = {}): RouteState {
  const L = Math.max(0, ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(String(o.level || 'A1').toUpperCase()));
  const base: [RoundKind, number][] = o.mixed ? [['quiz', 5], ['conjugate', 4], ['sentence', 3], ['errors', 3], ['typing', 4]]
    : L <= 1 ? ROUTE_DEFAULT.map(([k, n]) => (k === 'errors' ? ['typing', 4] : [k, n]) as [RoundKind, number]) : ROUTE_DEFAULT;
  const used = new Set<RoundKind>(), rounds: Round[] = [];
  for (const [k, n] of base) {
    if (k === 'daily') { rounds.push({kind: 'daily', n, items: null}); used.add(k); continue; }
    const pick = [k, ...ALTERNATIVES].find(x => !used.has(x) && (avail[x]?.length || 0) >= MIN[x]);
    if (!pick) continue;
    used.add(pick);
    rounds.push({kind: pick, n: Math.min(n, avail[pick]!.length), items: avail[pick]!.slice(0, n)});
  }
  return {v: 1, day, rounds, cur: 0, pos: 0, res: [], done: false};
}
/** XP shown for a finished round (the same rules as lib/motivation: daily 20 once a day, a game round ≥3 answers 10). */
export const roundXp = (kind: RoundKind, total: number, firstDaily: boolean) => kind === 'daily' ? (firstDaily ? 20 : 0) : total >= 3 ? 10 : 0;
export function routeProgress(r: RouteState | null | undefined) {
  if (!r || !r.rounds.length) return {pct: 0, roundsDone: 0, total: 0, xp: 0};
  const roundsDone = r.done ? r.rounds.length : r.cur, cur = r.rounds[r.cur];
  const part = !r.done && cur ? Math.min(1, r.pos / Math.max(1, cur.n)) : 0;
  return {pct: Math.round((roundsDone + part) / r.rounds.length * 100), roundsDone, total: r.rounds.length, xp: r.res.reduce((a, b) => a + b.xp, 0)};
}
export const routeMinutes = (r: RouteState) => r.rounds.reduce((m, x) => m + (x.kind === 'daily' ? 6 : Math.max(1, Math.round(x.n * 0.4))), 0);
export const routeXpMax = (r: RouteState) => r.rounds.reduce((m, x) => m + (x.kind === 'daily' ? 20 : x.n >= 3 ? 10 : 0), 0);
