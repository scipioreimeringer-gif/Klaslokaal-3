// Classroom word games — shared state machine (pure, unit-tested).
// The teacher's browser is the host: it applies every action and sends the resulting state to the student
// over the classroom's existing data channel. The shared state NEVER contains the cards of a
// 30 Seconds / Taboo round: those are fetched only by the explaining player (database RLS, game_rounds).

export type Role = 'teacher' | 'student';
export type Kind = 'flash' | 'thirty' | 'taboo';
export type FlashCard = {id: string; term: string; back: string; example: string};
export type GameState = {
  v: 1; id: string; kind: Kind;
  phase: 'ready' | 'running' | 'paused' | 'between' | 'ended';
  explainer: Role; round: number; roundId: string | null; cardCount: number; guessed: number[];
  duration: 30 | 60 | 90; remainingMs: number; runningSince: number | null;
  score: {teacher: number; student: number}; rounds: {explainer: Role; guessed: number; of: number}[];
  taboo: 0 | 1 | 2 | 3;
  flash: {cards: FlashCard[]; index: number; flipped: boolean; results: Record<string, 'good' | 'bad'>} | null;
  error: string | null;
};
export type Action =
  | {a: 'round'; roundId: string; cardCount: number}   // host, after the server created the round
  | {a: 'begin'} | {a: 'pause'} | {a: 'resume'} | {a: 'tick'}
  | {a: 'guessed'; index: number} | {a: 'undo'; index: number}
  | {a: 'switch'} | {a: 'duration'; seconds: 30 | 60 | 90} | {a: 'end'} | {a: 'error'; message: string}
  | {a: 'flip'} | {a: 'next'} | {a: 'prev'} | {a: 'mark'; result: 'good' | 'bad'};

export function newGame(id: string, kind: Kind, opts: {explainer?: Role; duration?: 30 | 60 | 90; taboo?: 0 | 1 | 2 | 3; cards?: FlashCard[]} = {}): GameState {
  return {v: 1, id, kind, phase: kind === 'flash' ? 'running' : 'between', explainer: opts.explainer || 'teacher', round: 0, roundId: null, cardCount: 0, guessed: [],
    duration: opts.duration || 30, remainingMs: (opts.duration || 30) * 1000, runningSince: null, score: {teacher: 0, student: 0}, rounds: [],
    taboo: kind === 'taboo' ? (opts.taboo || 3) : 0, flash: kind === 'flash' ? {cards: opts.cards || [], index: 0, flipped: false, results: {}} : null, error: null};
}
export const remaining = (s: GameState, now: number) => Math.max(0, s.remainingMs - (s.runningSince === null ? 0 : now - s.runningSince));
const other = (r: Role): Role => (r === 'teacher' ? 'student' : 'teacher');
function finishRound(s: GameState, _now: number): GameState {
  const n = s.guessed.length;
  return {...s, phase: 'between', remainingMs: 0, runningSince: null, score: {...s.score, [s.explainer]: s.score[s.explainer] + n}, rounds: [...s.rounds, {explainer: s.explainer, guessed: n, of: s.cardCount}].slice(-50), error: null};
}

/** Who may do what: only the explainer marks words as guessed; both players can pause, resume, switch roles between rounds and end. */
export function allowed(s: GameState, act: Action, actor: Role): boolean {
  switch (act.a) {
    case 'round': case 'tick': case 'error': return actor === 'teacher'; // host-internal
    case 'guessed': case 'undo': return actor === s.explainer && s.phase === 'running';
    case 'begin': return s.phase === 'ready';
    case 'switch': case 'duration': return s.phase === 'between' || s.phase === 'ready';
    default: return true;
  }
}

export function reduce(s: GameState, act: Action, actor: Role, now: number): GameState {
  if (!allowed(s, act, actor) || s.phase === 'ended' && act.a !== 'end') return s;
  switch (act.a) {
    case 'round': return {...s, phase: 'ready', round: s.round + 1, roundId: act.roundId, cardCount: act.cardCount, guessed: [], remainingMs: s.duration * 1000, runningSince: null, error: null};
    case 'begin': return {...s, phase: 'running', runningSince: now};
    case 'pause': return s.phase === 'running' ? {...s, phase: 'paused', remainingMs: remaining(s, now), runningSince: null} : s;
    case 'resume': return s.phase === 'paused' ? {...s, phase: 'running', runningSince: now} : s;
    case 'tick': return s.phase === 'running' && s.kind !== 'flash' && remaining(s, now) <= 0 ? finishRound(s, now) : s;
    case 'guessed': {
      if (act.index < 0 || act.index >= s.cardCount || s.guessed.includes(act.index)) return s;
      const g = {...s, guessed: [...s.guessed, act.index]};
      return g.guessed.length >= s.cardCount ? finishRound({...g, remainingMs: remaining(g, now)}, now) : g;
    }
    case 'undo': return {...s, guessed: s.guessed.filter(i => i !== act.index)};
    case 'switch': return {...s, explainer: other(s.explainer), phase: 'between', roundId: null, cardCount: 0, guessed: []};
    case 'duration': return {...s, duration: act.seconds, remainingMs: act.seconds * 1000};
    case 'end': return {...s, phase: 'ended', runningSince: null, remainingMs: remaining(s, now)};
    case 'error': return {...s, error: act.message.slice(0, 300)};
    case 'flip': return s.flash ? {...s, flash: {...s.flash, flipped: !s.flash.flipped}} : s;
    case 'next': case 'prev': {
      if (!s.flash) return s; const n = s.flash.cards.length; if (!n) return s;
      const index = act.a === 'next' ? Math.min(n - 1, s.flash.index + 1) : Math.max(0, s.flash.index - 1);
      return {...s, flash: {...s.flash, index, flipped: false}};
    }
    case 'mark': {
      if (!s.flash) return s; const c = s.flash.cards[s.flash.index]; if (!c) return s;
      const results = {...s.flash.results, [c.id]: act.result}; const done = s.flash.index + 1 >= s.flash.cards.length;
      return {...s, phase: done ? 'ended' : s.phase, flash: {...s.flash, results, index: done ? s.flash.index : s.flash.index + 1, flipped: false}};
    }
  }
  return s;
}

/** What is sent to the other player: the state with the timer as "remaining now" (no clock sync needed).
 *  Contains no card content for 30 Seconds / Taboo (by construction: the state never holds it). */
export function wire(s: GameState, now: number) { return {t: 'game' as const, k: 'state' as const, s: {...s, remainingMs: remaining(s, now), runningSince: s.runningSince === null ? null : 0}}; }
/** Receiver: turn the wire state into a local state (timer continues from the moment of receipt). */
export function fromWire(w: {s: GameState}, now: number): GameState { return {...w.s, runningSince: w.s.runningSince === null ? null : now}; }

/** Flashcard result → whether the student's word counts as correct practice. */
export const flashSummary = (s: GameState) => { const r = Object.values(s.flash?.results || {}); return {good: r.filter(x => x === 'good').length, bad: r.filter(x => x === 'bad').length, total: s.flash?.cards.length || 0}; };
