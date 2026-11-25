// v46 phase 3: the daily practice (pure, unit-tested). Built ONLY from the student's own material — words from the
// central word list, mistakes the teacher approved, exercises from earlier homework — never new words or topics.
// No AI here: the set is assembled deterministically per student and day (so it is the same after a refresh, and
// different from yesterday). AI is only used afterwards for feedback on a free sentence (writing/speaking).
import {checkText} from './answers.ts';
import {firstMeaning, pickDistractors, placeAnswer, singleConcept, validMc, wordClass} from './quiz.ts';
import {grammarBank, CONVERSATION, TOPIC_GROUP, type Note} from './grammar.ts';
import {categoryKey} from './analysis/core.ts';

export type Word = {id: string; term: string; translation: string; example?: string | null; pos?: string | null; status: string; due_at: string; difficult?: boolean;
  wrong_count: number; streak: number; last_practiced_at?: string | null; lesson_date?: string | null};
export type Mistake = {key: string; original: string; corrected: string; why: string; type: string; label: string; repeats: number; lesson_date: string};
export type HwItem = {key: string; type: string; prompt: string; options: string[]; answer: string; accept: string[]; explanation: string; label: string};
export type ItemState = {item_key: string; streak: number; wrong_count: number; due_at: string; last_practiced_at: string | null};

export type QKind = 'mc' | 'fill' | 'correct' | 'flash' | 'write' | 'speak' | 'answer';
export type Question = {
  id: string; kind: QKind; source: 'word' | 'mistake' | 'homework' | 'grammar'; ref: string;   // ref = vocab id or practice item key (gr: = built-in grammar)
  /** prompt/hint/options come from the student's own material; sub is a fixed interface text (translated in the UI) */
  prompt: string; sub?: string; hint?: string; options?: string[]; answers: string[]; explain: string; label: string; flip?: string;
  /** v51: why the answer is right (and the others wrong): fixed interface texts + forms, translated in the UI */ notes?: Note[];
  /** v51: grammar the free answer should show (checked by the one AI feedback call) */ topic?: string;
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

/** v51: the share of each kind of exercise per level, adjusted to what this student needs and has.
 *  g = grammar (built-in bank: choose / fill / conjugate), c = correcting own mistakes, p = producing language
 *  (write a sentence, answer a question, say a sentence, fill a gap), v = vocabulary in context. */
export function mixFor(level: string | null | undefined, max: number, have: {grammar: number; mistakes: number; words: number; produce: number}, need: {repeats: number} = {repeats: 0}) {
  const L = lvl(level);
  const share = L <= 1 ? {g: 0.25, c: 0.15, p: 0.05, v: 0.55} : L === 2 ? {g: 0.40, c: 0.25, p: 0.20, v: 0.15} : {g: 0.35, c: 0.25, p: 0.25, v: 0.15};
  // many repeated mistakes → more correcting (taken from the bank grammar)
  if (need.repeats >= 6 && have.mistakes >= 3) { share.c += 0.1; share.g -= 0.1; }
  const want = {g: Math.round(max * share.g), c: Math.round(max * share.c), p: Math.round(max * share.p), v: 0};
  want.v = Math.max(0, max - want.g - want.c - want.p);
  const got = {g: Math.min(want.g, have.grammar), c: Math.min(want.c, have.mistakes), p: Math.min(want.p, have.produce), v: Math.min(want.v, have.words)};
  // what one source cannot fill goes to the others (grammar, then mistakes, then words, then production)
  let left = max - got.g - got.c - got.p - got.v;
  for (const k of ['g', 'c', 'v', 'p'] as const) { if (left <= 0) break; const cap = ({g: have.grammar, c: have.mistakes, v: have.words, p: have.produce})[k]; const add = Math.min(left, cap - got[k]); if (add > 0) { got[k] += add; left -= add; } }
  return got;
}

/** One unique mistake per correction: the same error from several lessons (or said five times) is practised once,
 *  and its total frequency makes it more important. */
export function uniqueMistakes(list: Mistake[]): Mistake[] {
  const n = (s: string) => s.toLowerCase().replace(/[.,!?;:"“”'’¿¡]/g, '').replace(/\s+/g, ' ').trim();
  const by = new Map<string, Mistake>();
  for (const m of list) {
    const k = n(m.original) + '|' + n(m.corrected), prev = by.get(k);
    if (!prev) by.set(k, {...m}); else { prev.repeats += Math.max(1, m.repeats); if (m.lesson_date > prev.lesson_date) prev.lesson_date = m.lesson_date; }
  }
  return [...by.values()];
}

export function buildDaily(input: {studentId: string; day: string; level?: string | null; lang?: string; words: Word[]; mistakes: Mistake[]; homework: HwItem[]; state: ItemState[]; topics?: string[]; /** v68: grammar keys of learning-line topics in development / extra practice / recent lesson topics */ focusTopics?: string[]; now?: number; max?: number}): DailySet {
  const now = input.now ?? Date.now(), r = rng(seedOf(input.studentId + '|' + input.day)), L = lvl(input.level), max = input.max ?? 10;
  const st = new Map(input.state.map(s => [s.item_key, s]));
  const words = input.words.filter(w => w.term && w.translation);
  const mistakes = uniqueMistakes(input.mistakes);
  const lang = input.lang || '';
  // grammar of the bank: never above the level; A0/A1 only A1 material
  const bank = grammarBank(lang).filter(g => g.level <= Math.max(1, L));
  const convo = (CONVERSATION[(lang.startsWith('pt') ? 'pt' : lang.startsWith('nl') ? 'nl' : '') as 'pt' | 'nl'] || []).filter(([lv]) => lv <= Math.max(1, L));
  if (!words.length && !mistakes.length && !input.homework.length && !bank.length) return {day: input.day, questions: [], minutes: 0, empty: true};
  const defaultState = (key: string) => st.get(key) || {item_key: key, streak: 0, wrong_count: 0, due_at: new Date(0).toISOString(), last_practiced_at: null};
  const rankW = shuffle(words, r).map(w => ({w, p: priority({due_at: w.due_at, wrong_count: w.wrong_count, difficult: w.difficult, last: w.last_practiced_at, streak: w.streak}, now)})).sort((a, b) => b.p - a.p).map(x => x.w);
  const rankM = shuffle(mistakes, r).map(m => { const s = defaultState(m.key); return {m, p: priority({due_at: s.due_at, wrong_count: s.wrong_count, repeats: m.repeats, last: s.last_practiced_at, streak: s.streak}, now) + Math.min(2, (m.repeats - 1) * 0.5)}; }).sort((a, b) => b.p - a.p).map(x => x.m);
  const rankH = shuffle(input.homework, r).map(h => { const s = defaultState(h.key); return {h, p: priority({due_at: s.due_at, wrong_count: s.wrong_count, last: s.last_practiced_at, streak: s.streak}, now)}; }).sort((a, b) => b.p - a.p).map(x => x.h);

  // personal weak points: topics of the student's own mistakes (weighted by how often) and bank topics answered wrong
  const weak = new Map<string, number>();
  const bump = (t: string, w: number) => { for (const x of TOPIC_GROUP[t] || [t]) weak.set(x, (weak.get(x) || 0) + w * (x === t ? 1 : 0.5)); };
  for (const m of mistakes) { const k = categoryKey(m.label).key; bump(k, Math.min(4, m.repeats)); if (m.type === 'conjugation') bump('conjugation', 1); if (m.type === 'article') bump('articles', 1); if (m.type === 'preposition') bump('prepositions', 1); if (m.type === 'word_order') bump('word_order', 1); }
  for (const k of input.focusTopics || []) bump(k, 2);
  const gTopic = new Map(bank.map(g => [g.key, g.topic]));
  for (const s of input.state) if (s.item_key.startsWith('gr:') && s.wrong_count > 0) { const t = gTopic.get(s.item_key); if (t) bump(t, Math.min(3, s.wrong_count) * 0.5); }
  const known = new Set([...(input.topics || []), ...weak.keys()]);
  const rankG = shuffle(bank, r).map(g => { const s = defaultState(g.key);
    let p = priority({due_at: s.due_at, wrong_count: s.wrong_count, last: s.last_practiced_at, streak: s.streak}, now) + (weak.get(g.topic) || 0) * 1.5;
    // the student's own level first (A2 = past tenses, ser/estar, contractions …); easier material less often;
    // from B1, grammar of the level itself only comes in after it appeared in the lessons (mistakes / checklist)
    p += g.level === Math.max(1, L) ? 1.5 : -0.75 * (Math.max(1, L) - g.level);
    if (L >= 3 && g.level === L && !known.has(g.topic)) p -= 2.5;
    return {g, p}; }).sort((a, b) => b.p - a.p).map(x => x.g);

  const nH = Math.min(rankH.length, 2);
  const produce = L >= 2 ? Math.min(3, convo.length + Math.min(words.length, 2) + (mistakes.length ? 1 : 0)) : Math.min(2, words.filter(w => w.example).length);
  const need = {repeats: mistakes.reduce((n, m) => n + m.repeats, 0)};
  const mix = mixFor(input.level, max - nH, {grammar: rankG.length, mistakes: rankM.length, words: rankW.length, produce}, need);
  const qs: Question[] = [];

  // G: grammar from the bank — varied: one verb at most once, no exercise type more than half
  const usedVerb = new Set<string>(), perKind = new Map<string, number>(), capKind = Math.max(1, Math.ceil(mix.g / 2));
  for (const g of rankG) {
    if (qs.length >= mix.g) break;
    if (g.verb && usedVerb.has(g.verb)) continue;
    if ((perKind.get(g.kind) || 0) >= capKind) continue;
    if (g.verb) usedVerb.add(g.verb); perKind.set(g.kind, (perKind.get(g.kind) || 0) + 1);
    const kind: QKind = g.kind === 'choose' || g.kind === 'pick' ? 'mc' : g.kind === 'correct' ? 'correct' : 'fill';
    qs.push({id: 'g' + qs.length, kind, source: 'grammar', ref: g.key, label: g.label, prompt: g.prompt, sub: g.sub, hint: g.hint,
      options: g.options ? shuffle(g.options, rng(seedOf(g.key + input.day))) : undefined, answers: g.answers, explain: '', notes: g.notes});
  }
  // C: correcting own mistakes (one per unique mistake)
  let spoken = 0;
  rankM.slice(0, mix.c).forEach((m, i) => {
    const base = {source: 'mistake' as const, ref: m.key, label: m.label, explain: m.why ? `${m.corrected} — ${m.why}` : m.corrected};
    const roll = seedOf(m.key + input.day) % 4, gap = gapOf(m.original, m.corrected);
    if (L <= 1) { qs.push({...base, id: 'c' + i + 'k', kind: 'mc', prompt: '', sub: 'Welke zin is goed?', options: shuffle([m.corrected, m.original], rng(seedOf(m.key))), answers: [m.corrected]}); return; }
    if (gap && roll === 1) { qs.push({...base, id: 'c' + i + 'g', kind: 'fill', prompt: `${gap.before} _____ ${gap.after}`.trim(), sub: 'Vul in zoals het goed is', hint: m.original, answers: [gap.gap]}); return; }
    qs.push({...base, id: 'c' + i + 'x', kind: 'correct', prompt: m.original, sub: 'Verbeter de zin', answers: [m.corrected]});
  });
  // P: producing language — answer a question, write a sentence with a word (+ the grammar of the level), say a sentence
  const restM = rankM.slice(mix.c), freeW = rankW.slice(mix.v);
  const prod: Question[] = [];
  if (L >= 2) {
    shuffle(convo, r).slice(0, 2).forEach(([, qText, topic], i) => prod.push({id: 'p' + i + 'a', kind: 'answer', source: 'grammar', ref: `gr:${lang.slice(0, 2)}:cv:${seedOf(qText).toString(36)}`, label: 'Gespreksvraag',
      prompt: qText, sub: 'Beantwoord de vraag in een hele zin', answers: [qText], explain: '', topic}));
    (freeW.length ? freeW : rankW).slice(0, 1).forEach((w, i) => prod.push({id: 'p' + i + 'w', kind: 'write', source: 'word', ref: w.id, label: w.pos || '', prompt: w.term, hint: w.translation,
      sub: L >= 2 && lang ? 'Schrijf een zin met dit woord in de verleden tijd' : 'Schrijf een korte zin met dit woord', answers: [w.term], explain: w.example ? `${w.term} — ${w.example}` : `${w.term} = ${w.translation}`, topic: 'past_tense'}));
    (restM.length ? restM : []).slice(0, 1).forEach((m, i) => { if (spoken++ < 1) prod.push({id: 'p' + i + 's', kind: 'speak', source: 'mistake', ref: m.key, label: m.label, prompt: m.original, sub: 'Zeg de zin goed', answers: [m.corrected], explain: m.why ? `${m.corrected} — ${m.why}` : m.corrected}); });
  } else {
    words.filter(w => w.example).slice(0, 2).forEach((w, i) => { const t = w.term.replace(/^(de|het|een|o|a|os|as|um|uma)\s+/i, ''), re = new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      if (re.test(w.example!)) prod.push({id: 'p' + i + 'f', kind: 'fill', source: 'word', ref: w.id, label: w.pos || '', prompt: w.example!.replace(re, '_____'), sub: 'Vul het ontbrekende woord in', hint: w.translation, answers: [t], explain: `${w.term} — ${w.example}`}); });
  }
  qs.push(...shuffle(prod, r).slice(0, mix.p));
  // V: vocabulary — in context first (own example sentence), from A2 rarely a bare translation
  const usedW = new Set(qs.filter(q => q.source === 'word').map(q => q.ref));
  // v67: multiple choice = exactly four options of the same word class and the same language (terms or translations);
  // multi-concept records and too few good distractors → another kind of question instead
  const optPool = words.filter(w => singleConcept(w.term)).map(w => ({w, cls: wordClass({term: w.term, meaning: w.translation, pos: w.pos})}));
  const mc4 = (right: string, cls: ReturnType<typeof wordClass>, side: 'term' | 'translation', self: string, seed: number) => {
    const d = pickDistractors({text: right, cls}, optPool.filter(o => o.w.id !== self).map(o => ({text: o.w[side], cls: o.cls})), seed);
    const o = d.length === 3 ? placeAnswer(right, d, seed + 1) : [];
    return validMc({options: o, answer: right}) ? o : null;
  };
  rankW.filter(w => !usedW.has(w.id)).slice(0, mix.v).forEach((w, i) => {
    const base = {source: 'word' as const, ref: w.id, label: w.pos || '', explain: w.example ? `${w.term} — ${w.example}` : `${w.term} = ${w.translation}`};
    const t = w.term.replace(/^(de|het|een|o|a|os|as|um|uma)\s+/i, ''), re = new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    const hasEx = !!w.example && re.test(w.example);
    const roll = (seedOf(w.id + input.day) % 6), one = singleConcept(w.term), cls = wordClass({term: w.term, meaning: w.translation, pos: w.pos});
    if (hasEx && (L >= 2 || roll <= 2)) { qs.push({...base, id: 'v' + i + 'f', kind: 'fill', prompt: w.example!.replace(re, '_____'), sub: 'Vul het ontbrekende woord in', hint: w.translation, answers: [t]}); return; }
    const or = one && (L >= 2 || roll % 3 === 0) ? mc4(w.term, cls, 'term', w.id, seedOf(w.term + input.day)) : null;
    if (or) { qs.push({...base, id: 'v' + i + 'r', kind: 'mc', prompt: firstMeaning(w.translation), sub: 'Welk woord past?', options: or, answers: [w.term]}); return; }
    const om = one && roll % 2 === 0 ? mc4(firstMeaning(w.translation), cls, 'translation', w.id, seedOf(w.id + input.day)) : null;
    if (om) { qs.push({...base, id: 'v' + i + 'm', kind: 'mc', prompt: w.term, sub: 'Wat betekent dit?', options: om, answers: [firstMeaning(w.translation)]}); return; }
    const toEn = roll % 2 === 1;
    qs.push({...base, id: 'v' + i + 'c', kind: 'flash', prompt: toEn ? w.term : w.translation, flip: toEn ? w.translation : w.term, answers: [toEn ? w.translation : w.term]});
  });
  rankH.slice(0, nH).forEach((h, i) => {
    const base = {source: 'homework' as const, ref: h.key, label: h.label, explain: h.explanation || h.answer};
    if (h.type === 'multiple_choice' && validMc({options: h.options, answer: h.answer})) qs.push({...base, id: 'h' + i, kind: 'mc', prompt: h.prompt, options: h.options, answers: [h.answer, ...h.accept]});
    else qs.push({...base, id: 'h' + i, kind: 'fill', prompt: h.prompt, answers: [h.answer, ...h.accept]});
  });
  // no duplicates: the same item (ref) or the same prompt never twice in one set
  const seen = new Set<string>();
  const questions = shuffle(qs, r).filter(q => { const k = q.ref + '|' + q.prompt; if (seen.has(q.ref) || seen.has(k)) return false; seen.add(q.ref); seen.add(k); return true; }).slice(0, max);
  const secs = questions.reduce((n, q) => n + (q.kind === 'write' || q.kind === 'speak' || q.kind === 'answer' ? 75 : q.kind === 'correct' ? 50 : 30), 0);
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
