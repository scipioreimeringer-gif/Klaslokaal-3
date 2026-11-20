// v46 phase 3: the daily practice (pure, unit-tested). Built ONLY from the student's own material — words from the
// central word list, mistakes the teacher approved, exercises from earlier homework — never new words or topics.
// No AI here: the set is assembled deterministically per student and day (so it is the same after a refresh, and
// different from yesterday). AI is only used afterwards for feedback on a free sentence (writing/speaking).
import {checkText, mcOptions} from './answers.ts';

export type Word = {id: string; term: string; translation: string; example?: string | null; pos?: string | null; status: string; due_at: string; difficult?: boolean;
  wrong_count: number; streak: number; last_practiced_at?: string | null; lesson_date?: string | null};
export type Mistake = {key: string; original: string; corrected: string; why: string; type: string; label: string; repeats: number; lesson_date: string};
export type HwItem = {key: string; type: string; prompt: string; options: string[]; answer: string; accept: string[]; explanation: string; label: string};
export type ItemState = {item_key: string; streak: number; wrong_count: number; due_at: string; last_practiced_at: string | null};

export type QKind = 'mc' | 'fill' | 'correct' | 'flash' | 'write' | 'speak';
export type Question = {
  id: string; kind: QKind; source: 'word' | 'mistake' | 'homework'; ref: string;   // ref = vocab id or practice item key
  /** prompt/hint/options come from the student's own material; sub is a fixed interface text (translated in the UI) */
  prompt: string; sub?: string; hint?: string; options?: string[]; answers: string[]; explain: string; label: string; flip?: string;
};
export type DailySet = {day: string; questions: Question[]; minutes: number; empty: boolean};

/* deterministic randomness per student and day */
export function seedOf(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function shuffle<T>(a: T[], r: () => number) { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }
const lvl = (l: string | null | undefined) => Math.max(0, ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(String(l || 'A1').toUpperCase()));
const H = 3600e3;

/** Higher = more urgent. Due items, difficult words and repeated mistakes come first; something practised in the
 *  last ~20 hours waits (unless it went wrong), so the same question does not come back every day. */
export function priority(o: {due_at: string; wrong_count: number; difficult?: boolean; repeats?: number; last?: string | null; streak: number}, now: number) {
  let p = 0;
  if (Date.parse(o.due_at) <= now) p += 3;
  if (o.difficult) p += 2;
  p += Math.min(3, o.wrong_count);
  if ((o.repeats || 0) > 1) p += 1;
  if (!o.last) p += 1;
  if (o.last && now - Date.parse(o.last) < 20 * H && o.streak > 0) p -= 5;
  p -= Math.min(3, o.streak) * 0.5;
  return p;
}

/** Word that differs between the wrong and the right sentence → used as the gap in a fill-in exercise. */
export function gapOf(original: string, corrected: string): {before: string; gap: string; after: string} | null {
  const a = original.trim().split(/\s+/), b = corrected.trim().split(/\s+/);
  let i = 0; while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++;
  let j = 0; while (j < a.length - i && j < b.length - i && a[a.length - 1 - j].toLowerCase() === b[b.length - 1 - j].toLowerCase()) j++;
  const gap = b.slice(i, b.length - j).join(' ');
  if (!gap || gap.split(' ').length > 3) return null;
  return {before: b.slice(0, i).join(' '), gap, after: b.slice(b.length - j).join(' ')};
}

export function buildDaily(input: {studentId: string; day: string; level?: string | null; words: Word[]; mistakes: Mistake[]; homework: HwItem[]; state: ItemState[]; now?: number; max?: number}): DailySet {
  const now = input.now ?? Date.now(), r = rng(seedOf(input.studentId + '|' + input.day)), L = lvl(input.level), max = input.max ?? 10;
  const st = new Map(input.state.map(s => [s.item_key, s]));
  const words = input.words.filter(w => w.term && w.translation);
  if (!words.length && !input.mistakes.length && !input.homework.length) return {day: input.day, questions: [], minutes: 0, empty: true};
  const rankW = shuffle(words, r).map(w => ({w, p: priority({due_at: w.due_at, wrong_count: w.wrong_count, difficult: w.difficult, last: w.last_practiced_at, streak: w.streak}, now)})).sort((a, b) => b.p - a.p).map(x => x.w);
  const defaultState = (key: string) => st.get(key) || {item_key: key, streak: 0, wrong_count: 0, due_at: new Date(0).toISOString(), last_practiced_at: null};
  const rankM = shuffle(input.mistakes, r).map(m => { const s = defaultState(m.key); return {m, p: priority({due_at: s.due_at, wrong_count: s.wrong_count, repeats: m.repeats, last: s.last_practiced_at, streak: s.streak}, now)}; }).sort((a, b) => b.p - a.p).map(x => x.m);
  const rankH = shuffle(input.homework, r).map(h => { const s = defaultState(h.key); return {h, p: priority({due_at: s.due_at, wrong_count: s.wrong_count, last: s.last_practiced_at, streak: s.streak}, now)}; }).sort((a, b) => b.p - a.p).map(x => x.h);

  // mix: mistakes and words from different lessons; fewer free tasks at A0/A1
  const nM = Math.min(rankM.length, Math.round(max * (L <= 1 ? 0.3 : 0.4)));
  const nH = Math.min(rankH.length, 2);
  const nW = Math.min(rankW.length, max - nM - nH);
  const fillUp = max - nM - nH - nW;
  const pickM = rankM.slice(0, nM + Math.max(0, fillUp));
  const pickW = rankW.slice(0, nW), pickH = rankH.slice(0, nH);
  const pool = words.map(w => w.translation), termPool = words.map(w => w.term);
  const qs: Question[] = [];
  let free = 0, spoken = 0;

  pickW.forEach((w, i) => {
    const base = {source: 'word' as const, ref: w.id, label: w.pos || '', explain: w.example ? `${w.term} — ${w.example}` : `${w.term} = ${w.translation}`};
    const hasEx = !!w.example && new RegExp('\\b' + w.term.replace(/^(de|het|een|o|a|os|as|um|uma)\s+/i, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(w.example);
    const roll = (seedOf(w.id + input.day) % 6);
    if (L >= 3 && free < 1 && roll === 0) { free++; qs.push({...base, id: 'q' + i + 'w', kind: 'write', prompt: w.term, sub: 'Schrijf een korte zin met dit woord', hint: w.translation, answers: [w.term], explain: base.explain}); return; }
    if (hasEx && roll <= 2) {
      const t = w.term.replace(/^(de|het|een|o|a|os|as|um|uma)\s+/i, '');
      qs.push({...base, id: 'q' + i + 'f', kind: 'fill', prompt: w.example!.replace(new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), '_____'), sub: 'Vul het ontbrekende woord in', hint: w.translation, answers: [t]}); return;
    }
    if (pool.length >= 4 && roll % 2 === 0) { qs.push({...base, id: 'q' + i + 'm', kind: 'mc', prompt: w.term, sub: 'Wat betekent dit?', options: mcOptions(w.translation, pool, seedOf(w.id + input.day)), answers: [w.translation]}); return; }
    if (termPool.length >= 4 && roll % 3 === 0) { qs.push({...base, id: 'q' + i + 'r', kind: 'mc', prompt: w.translation, sub: 'Welk woord past?', options: mcOptions(w.term, termPool, seedOf(w.term + input.day)), answers: [w.term]}); return; }
    const toEn = roll % 2 === 1;
    qs.push({...base, id: 'q' + i + 'c', kind: 'flash', prompt: toEn ? w.term : w.translation, flip: toEn ? w.translation : w.term, answers: [toEn ? w.translation : w.term]});
  });
  pickM.forEach((m, i) => {
    const base = {source: 'mistake' as const, ref: m.key, label: m.label, explain: m.why ? `${m.corrected} — ${m.why}` : m.corrected};
    const roll = seedOf(m.key + input.day) % 4, gap = gapOf(m.original, m.corrected);
    if (spoken < 1 && roll === 0 && L >= 1) { spoken++; qs.push({...base, id: 'q' + i + 's', kind: 'speak', prompt: m.original, sub: 'Zeg de zin goed', answers: [m.corrected]}); return; }
    if (gap && roll === 1) { qs.push({...base, id: 'q' + i + 'g', kind: 'fill', prompt: `${gap.before} _____ ${gap.after}`.trim(), sub: 'Vul in zoals het goed is', hint: m.original, answers: [gap.gap]}); return; }
    if (roll === 2 || L <= 1) { qs.push({...base, id: 'q' + i + 'k', kind: 'mc', prompt: '', sub: 'Welke zin is goed?', options: shuffle([m.corrected, m.original], rng(seedOf(m.key))), answers: [m.corrected]}); return; }
    qs.push({...base, id: 'q' + i + 'x', kind: 'correct', prompt: m.original, sub: 'Verbeter de zin', answers: [m.corrected]});
  });
  pickH.forEach((h, i) => {
    const base = {source: 'homework' as const, ref: h.key, label: h.label, explain: h.explanation || h.answer};
    if (h.type === 'multiple_choice' && h.options.length >= 2) qs.push({...base, id: 'q' + i + 'h', kind: 'mc', prompt: h.prompt, options: h.options, answers: [h.answer, ...h.accept]});
    else qs.push({...base, id: 'q' + i + 'h', kind: 'fill', prompt: h.prompt, answers: [h.answer, ...h.accept]});
  });
  const questions = shuffle(qs, r).slice(0, max);
  const secs = questions.reduce((n, q) => n + (q.kind === 'write' || q.kind === 'speak' ? 75 : q.kind === 'correct' ? 50 : 30), 0);
  return {day: input.day, questions, minutes: Math.max(1, Math.round(secs / 60)), empty: !questions.length};
}

/** Sentences: punctuation and capitals do not matter; accents are "almost right". */
export function checkAnswer(q: Question, given: string): 'correct' | 'accent' | 'wrong' {
  if (q.kind === 'correct' || q.kind === 'speak') {
    const s = (x: string) => x.toLowerCase().replace(/[.,!?;:"“”'’¿¡]/g, '').replace(/\s+/g, ' ').trim();
    return checkText(s(given), q.answers.map(s));
  }
  return checkText(given, q.answers);
}

/** Consecutive practice days up to today (or up to yesterday, when today is not done yet). */
export function streakOf(days: string[], today: string) {
  const set = new Set(days); const d = new Date(today + 'T12:00:00Z');
  if (!set.has(today)) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0; while (set.has(d.toISOString().slice(0, 10))) { n++; d.setUTCDate(d.getUTCDate() - 1); }
  return n;
}

/** End of the day summary: words and grammar that still need attention. */
export function summaryOf(results: {q: Question; ok: boolean}[]) {
  const wrong = results.filter(r => !r.ok);
  return {correct: results.length - wrong.length, wrong: wrong.length,
    words: [...new Set(wrong.filter(r => r.q.source === 'word').map(r => r.q.kind === 'flash' || r.q.sub === 'Welk woord past?' ? r.q.answers[0] : r.q.prompt))].slice(0, 8),
    grammar: [...new Set(wrong.filter(r => r.q.source !== 'word' && r.q.label).map(r => r.q.label))].slice(0, 5)};
}
