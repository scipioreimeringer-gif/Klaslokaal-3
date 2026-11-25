// v54: question sets for the seven practice games (pure, unit-tested, no AI, no database).
// Per learning language and CEFR level: the student's own word list first (words above the chosen level are left
// out), then — only when there are too few — the built-in word bank (marked "bank"), and the built-in grammar of
// lib/grammar.ts for sentences, conjugation and corrections. Every item is validated: a game never starts with an
// empty prompt, "undefined", "null" or a missing answer.
import {grammarBank, describe, type GItem, type Note} from './grammar.ts';
import type {BankItem} from './wordbank/types.ts';
import {firstMeaning, pickDistractors, placeAnswer, singleConcept, validMc, wordClass} from './quiz.ts';

export type Lvl = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
export const LVLS: Lvl[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
/** A1 = 1 … C1 = 5 (C2 counts as C1; unknown = A1). */
export function levelNum(l: string | null | undefined): number {
  const i = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(String(l || '').toUpperCase().trim());
  return i < 0 ? (String(l || '').toUpperCase() === 'A0' ? 1 : 1) : Math.min(5, i + 1);
}
export const asLvl = (l: string | null | undefined): Lvl => LVLS[levelNum(l) - 1];
export const isLvl = (x: unknown): x is Lvl => (LVLS as unknown[]).includes(x);

export type Gram = {pos?: string; article?: string; plural?: string; past_sg?: string; past_pl?: string; participle?: string; aux?: string; separable?: string; conj_present?: string[]; conj_past?: string[]};
export type OwnWord = {id: string; term: string; translation: string; example?: string | null; pos?: string | null; level?: string | null; grammar?: Gram | null};
export type Card = {key: string; vocabId?: string; term: string; meaning: string; example?: string; pos?: string; source: 'own' | 'bank'; gram?: Gram | null};
export type TItem = {key: string; vocabId?: string; itemKey?: string; prompt: string; hint: string; answers: string[]; notes: Note[]; explain?: string; source: 'own' | 'bank'; label: string};

export const DECK: Record<Lvl, number> = {A1: 8, A2: 10, B1: 12, B2: 12, C1: 12};
export const MATCH: Record<Lvl, number> = {A1: 4, A2: 5, B1: 6, B2: 7, C1: 8};
/** v67: every multiple-choice question has exactly four options (one correct), at every level. */
export const OPTIONS: Record<Lvl, number> = {A1: 4, A2: 4, B1: 4, B2: 4, C1: 4};

export function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
export function shuffle<T>(a: T[], r: () => number) { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }
const bad = (s: unknown) => typeof s !== 'string' || !s.trim() || /\bundefined\b|\bnull\b|\bNaN\b|\[object/.test(s);
const key = (s: string) => String(s || '').toLowerCase().trim().replace(/^(de|het|een|o|a|os|as|um|uma)\s+/, '').replace(/\s+/g, ' ');
export const validCard = (c: Card) => !bad(c.term) && !bad(c.meaning) && key(c.term) !== key(c.meaning);
export const validItem = (t: TItem) => !bad(t.prompt) && t.prompt.replace(/[_\s.·—-]/g, '').length >= 2 && t.answers.length > 0 && t.answers.every(a => !bad(a));

/** Own words that suit the level (a word marked B2 is not practised at A1), then bank words of that level. */
export function wordDeck(own: OwnWord[], bank: BankItem[], level: Lvl, n: number, seed: number): {cards: Card[]; fromBank: number} {
  const L = levelNum(level), r = rng(seed);
  // v67: records with several unrelated concepts ("Receita Federal / está aberta / …") are not practised as one word
  const mine = own.filter(w => (!w.level || levelNum(w.level) <= L) && singleConcept(w.term, /expr|uitdr/i.test(w.pos || '') ? 'expression' : null))
    .map(w => ({key: 'v:' + w.id, vocabId: w.id, term: w.term.trim(), meaning: (w.translation || '').trim(), example: w.example || undefined, pos: w.pos || undefined, source: 'own' as const, gram: w.grammar || null}))
    .filter(validCard);
  // the most urgent own words first (the list arrives in practice order), a little variety among them
  const head = shuffle(mine.slice(0, n * 2), r).slice(0, n);
  const have = new Set(head.map(c => key(c.term)));
  const need = n - head.length;
  let extra: Card[] = [];
  if (need > 0) {
    // v67: only bank words with an English translation (a Dutch description as "meaning" would mix languages)
    const pool = bankForLevel(bank, level).filter(b => !have.has(key(b.term)) && (b.en || '').trim())
      .map(b => ({key: 'b:' + b.id, term: b.term, meaning: b.en.trim(), example: undefined, pos: b.cat, source: 'bank' as const})).filter(validCard);
    extra = shuffle(pool, r).slice(0, need);
  }
  return {cards: [...head, ...extra], fromBank: extra.length};
}
/** Bank words for a level. C1: the B2 words plus fixed expressions, sayings and proverbs (idiomatic language). */
export function bankForLevel(bank: BankItem[], level: Lvl): BankItem[] {
  if (level === 'C1') return bank.filter(b => b.level === 'B2' || ['expression', 'saying', 'proverb'].includes(b.cat));
  const exact = bank.filter(b => b.level === level);
  return exact.length >= 12 ? exact : bank.filter(b => levelNum(b.level) <= levelNum(level));
}
/** v67: quiz options — exactly four, all translations (one language), the same word class, a similar form; the
 *  answer at a random position. Fewer than three good distractors → [] (the question is replaced, never shown). */
export function quizOptions(card: Card, pool: Card[], level: Lvl, seed: number): string[] {
  const right = firstMeaning(card.meaning), cls = wordClass(card);
  const d = pickDistractors({text: right, cls}, pool.filter(p => p.key !== card.key).map(p => ({text: p.meaning, cls: wordClass(p)})), seed, OPTIONS[level] - 1);
  if (d.length < OPTIONS[level] - 1) return [];
  const o = placeAnswer(right, d, seed * 7 + 3);
  return validMc({options: o, answer: right}) ? o : [];
}
/** The answer shown for a quiz card (first meaning of a synonym list). */
export const quizAnswer = (c: Card) => firstMeaning(c.meaning);

/** v67: grammar multiple choice of the level (verb forms, hebben/zijn, articles, prepositions, ser/estar, relative
 *  pronouns, idioms …) — only items with exactly four options; the student's weak topics first. */
export function grammarQuiz(lang: string, level: Lvl, n: number, seed: number, weak: string[] = []): GItem[] {
  const r = rng(seed), w = new Set(weak), L = levelNum(level);
  const pool = atLevel(lang, level).filter(g => g.kind === 'choose' && g.prompt && validMc({options: g.options, answer: g.answers[0]}) && (L > 1 || g.level <= 1));
  const ranked = byLevel(pool, level, r).sort((a, b) => Number(w.has(b.topic)) - Number(w.has(a.topic)));
  const out: GItem[] = [], perTopic = new Map<string, number>(), verbs = new Set<string>();
  for (const g of ranked) {
    if (out.length >= n) break;
    if ((perTopic.get(g.topic) || 0) >= Math.max(2, Math.ceil(n / 3))) continue;   // varied: not all the same topic
    if (g.verb && verbs.has(g.verb)) continue;
    perTopic.set(g.topic, (perTopic.get(g.topic) || 0) + 1); if (g.verb) verbs.add(g.verb);
    out.push({...g, options: placeAnswer(g.answers[0], g.options!.filter(o => o !== g.answers[0]), seed + out.length * 13)});
  }
  return out;
}

/** v67: pairs for "Woorden koppelen" — no duplicate words or meanings, no meaning that fits two words, single
 *  concepts only; preferably one coherent group (one word class) when there are enough of them. */
export function matchDeck(cards: Card[], n: number, seed: number): Card[] {
  const terms = new Set<string>(), means = new Set<string>(), ok: Card[] = [];
  for (const c of cards) {
    const t = key(c.term), m = key(firstMeaning(c.meaning));
    if (!t || !m || terms.has(t) || means.has(m) || !singleConcept(c.term)) continue;
    terms.add(t); means.add(m); ok.push({...c, meaning: firstMeaning(c.meaning)});
  }
  const by = new Map<string, Card[]>(); for (const c of ok) { const k = wordClass(c) || 'other'; by.set(k, [...(by.get(k) || []), c]); }
  const group = [...by.values()].sort((a, b) => b.length - a.length)[0] || [];
  return shuffle(group.length >= n ? group : ok, rng(seed)).slice(0, n);
}

/** v67: flashcard variants from the stored grammar of a word: word → translation (always possible), and from A2
 *  infinitive → past tense / participle + hebben or zijn, noun → article / plural. */
export type FlashFace = {front: string; back: string; ask: string};
export function flashFace(c: Card, level: Lvl, seed: number, rev: boolean): FlashFace {
  const g = c.gram, L = levelNum(level), base: FlashFace = rev ? {front: c.meaning, back: c.term, ask: 'Vertaling → woord'} : {front: c.term, back: c.meaning, ask: 'Woord → vertaling'};
  if (!g || seed % 3 !== 0) return base;
  const inf = c.term.trim(), opts: FlashFace[] = [];
  if (g.pos === 'verb' && L >= 2) {
    if (g.past_sg && g.past_pl) opts.push({front: inf, back: `${g.past_sg} / ${g.past_pl}`, ask: 'Infinitief → verleden tijd'});
    if (g.participle && (g.aux === 'H' || g.aux === 'Z')) opts.push({front: inf, back: `${g.aux === 'Z' ? 'is' : 'heeft'} ${g.participle}`, ask: 'Infinitief → voltooid deelwoord met hulpwerkwoord'});
  }
  if (g.pos === 'noun') {
    const bare = inf.replace(/^(de|het)\s+/i, '');
    if (g.article && /^(de|het)$/i.test(g.article)) opts.push({front: bare, back: `${g.article} ${bare}`, ask: 'Zelfstandig naamwoord → lidwoord'});
    if (g.plural && L >= 1) opts.push({front: bare, back: g.plural, ask: 'Zelfstandig naamwoord → meervoud'});
  }
  return opts.length ? opts[Math.floor(seed / 3) % opts.length] : base;
}

const fromG = (g: GItem, prompt: string, hint: string): TItem => ({key: g.key, itemKey: g.key, prompt, hint, answers: g.answers, notes: g.notes, source: 'bank', label: g.label});
const atLevel = (lang: string, level: Lvl) => grammarBank(lang).filter(g => g.level <= levelNum(level));
const VERB_TOPICS = new Set(['present_tense', 'past_tense', 'conjugation', 'auxiliary', 'participle']);
/** Closer to the chosen level first (so B1 does not get mostly A1 material), then random for variety. */
function byLevel<T extends {level: number}>(list: T[], level: Lvl, r: () => number) {
  const L = levelNum(level);
  return shuffle(list, r).sort((a, b) => Math.abs(L - a.level) - Math.abs(L - b.level));
}

/** Conjugation: infinitive, tense and person always shown; a sentence with a gap from A2 on, bare forms at A1 too. */
export function conjugationSet(lang: string, level: Lvl, n: number, seed: number): TItem[] {
  const r = rng(seed), L = levelNum(level);
  const pool = atLevel(lang, level).filter(g => (g.kind === 'fill' || g.kind === 'conjugate') && describe(g) && (VERB_TOPICS.has(g.topic) || g.tense))
    .filter(g => L > 1 || g.level === 1);                                          // A1: present tense only
  const out: TItem[] = [], verbs = new Set<string>();
  for (const g of byLevel(pool, level, r)) {
    if (out.length >= n) break;
    const d = describe(g)!; if (verbs.has(d.verb) && pool.length > n * 2) continue; verbs.add(d.verb);
    const hint = `${d.verb} · ${d.tense} · ${d.person}`;
    out.push(g.kind === 'conjugate' ? fromG(g, d.verb, hint) : fromG(g, g.prompt, hint));
  }
  return out.filter(validItem);
}

/** v62: conjugation items from the student's OWN verbs in the central word bank — only verbs with a complete,
 *  valid conjugation (6 forms); Portuguese only the unambiguous persons (eu, ele/ela, nós, eles/elas). */
const PRON: Record<string, [number, string][]> = {nl: [[0, 'ik'], [1, 'jij'], [2, 'hij/zij'], [3, 'wij'], [4, 'jullie'], [5, 'zij']], pt: [[0, 'eu'], [2, 'ele/ela'], [3, 'nós'], [5, 'eles/elas']]};
export function ownConjugations(own: (OwnWord & {grammar?: {pos?: string; conj_present?: string[]; conj_past?: string[]; past_sg?: string; past_pl?: string; participle?: string; aux?: string} | null})[], lang: string, level: Lvl, n: number, seed: number): TItem[] {
  const r = rng(seed), P = PRON[lang]; if (!P) return [];
  const out: TItem[] = [];
  for (const w of shuffle(own, r)) {
    if (out.length >= n) break;
    const g = w.grammar; if (!g || g.pos !== 'verb') continue;
    const mode = (seed + out.length + w.id.length) % 3;   // vary: perfect / past / full table
    // v65: Dutch past tense and perfect from the stored forms (H/Z decides hebben/zijn; H/Z depends on meaning → skipped)
    if (lang === 'nl' && levelNum(level) > 1 && g.participle && (g.aux === 'H' || g.aux === 'Z') && mode === 0) {
      const inf = (w.term || '').trim(), aux = g.aux === 'Z' ? 'ben' : 'heb';
      out.push({key: 'own-perf:' + w.id, vocabId: w.id, prompt: `ik ___ (${inf})`, hint: `${inf} · voltooide tijd · ik`, answers: [`${aux} ${g.participle.trim()}`], notes: [], source: 'own', label: 'voltooide tijd'});
      continue;
    }
    if (lang === 'nl' && levelNum(level) > 1 && g.past_sg && g.past_pl && (mode === 1 || !g.conj_present)) {
      const inf = (w.term || '').trim(), pl = (seed + out.length) % 2 === 1;
      out.push({key: 'own-past:' + w.id + (pl ? ':pl' : ':sg'), vocabId: w.id, prompt: `${pl ? 'wij' : 'ik'} ___ (${inf})`, hint: `${inf} · verleden tijd · ${pl ? 'wij' : 'ik'}`, answers: [(pl ? g.past_pl : g.past_sg).trim()], notes: [], source: 'own', label: 'verleden tijd'});
      continue;
    }
    const tenses: [string, string[] | undefined][] = [['tegenwoordige tijd', g.conj_present], ...(levelNum(level) > 1 ? [['verleden tijd', g.conj_past] as [string, string[] | undefined]] : [])];
    const ok = tenses.filter(([, f]) => Array.isArray(f) && f.length >= 6 && f.every(x => typeof x === 'string' && x.trim()));
    if (!ok.length) continue;
    const [tense, forms] = ok[Math.floor(r() * ok.length)], [i, pron] = P[Math.floor(r() * P.length)];
    const form = forms![i].trim().replace(new RegExp('^' + pron.split('/')[0] + '\\s+', 'i'), '');      // "ik loop" → "loop"
    const inf = (w.term || '').trim();
    if (!form || !inf || form.toLowerCase() === inf.toLowerCase() && tense !== 'tegenwoordige tijd') continue;
    out.push({key: 'own-conj:' + w.id + ':' + tense + ':' + i, vocabId: w.id, prompt: `${pron} ___ (${inf})`, hint: `${inf} · ${tense} · ${pron}`, answers: [form], notes: [], source: 'own', label: tense});
  }
  return out.filter(validItem);
}

/** Sentence completion: own example sentences first, then grammar in context (articles, prepositions, ser/estar,
 *  verb forms at the level); the word to fill in is never in the prompt. */
export function sentenceSet(own: OwnWord[], lang: string, level: Lvl, n: number, seed: number): TItem[] {
  const r = rng(seed), L = levelNum(level), out: TItem[] = [];
  for (const w of shuffle(own.filter(w => w.example && (!w.level || levelNum(w.level) <= L)), r)) {
    if (out.length >= Math.ceil(n * 0.6)) break;
    const t = w.term.replace(/^(de|het|een|o|a|os|as|um|uma)\s+/i, '').trim(); if (!t) continue;
    const re = new RegExp('(^|[^\\p{L}])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^\\p{L}])', 'iu');
    if (!re.test(w.example!)) continue;
    out.push({key: 'v:' + w.id, vocabId: w.id, prompt: w.example!.replace(re, '$1_____'), hint: w.translation || '', answers: [t], notes: [], source: 'own', label: ''});
  }
  const g = atLevel(lang, level).filter(x => (x.kind === 'fill' || x.kind === 'choose') && x.prompt.includes('___') && !x.key.includes(':cj:'));
  const nonVerb = g.filter(x => !VERB_TOPICS.has(x.topic) && !x.tense), verb = g.filter(x => VERB_TOPICS.has(x.topic) || x.tense);
  for (const x of [...byLevel(nonVerb, level, r), ...byLevel(verb, level, r)]) {
    if (out.length >= n) break;
    const prompt = x.prompt.replace(/_{3,}/, '_____');
    const d = describe(x);
    // a choice item shows its options (e.g. "heb / ben"), a fill item the verb to use
    out.push(fromG(x, prompt, x.hint || (x.kind === 'choose' && x.options ? x.options.join(' / ') : d ? `(${d.verb})` : '')));
  }
  return out.filter(validItem);
}

/** Correcting sentences: own approved mistakes first, then wrong sentences of the level (longer and subtler from B2). */
export function correctionSet(own: {key: string; original: string; corrected: string; why?: string}[], lang: string, level: Lvl, n: number, seed: number): TItem[] {
  const r = rng(seed), out: TItem[] = [];
  for (const m of shuffle(own, r)) { if (out.length >= Math.ceil(n * 0.6)) break; out.push({key: m.key, itemKey: m.key, prompt: m.original, hint: '', answers: [m.corrected], notes: m.why ? [{k: m.why}] : [], source: 'own', label: ''}); }
  const g = atLevel(lang, level).filter(x => x.kind === 'correct' || (x.kind === 'pick' && x.options?.length === 2 && !x.prompt));
  for (const x of byLevel(g, level, r)) {
    if (out.length >= n) break;
    const wrong = x.kind === 'correct' ? x.prompt : x.options!.find(o => !x.answers.includes(o))!;
    out.push(fromG(x, wrong, ''));
  }
  return out.filter(validItem);
}

/** Idioms and register (C1/B2) for the quiz: meaning of an expression, choose the right register. */
export function idiomQuestions(lang: string, level: Lvl, seed: number) {
  return shuffle(atLevel(lang, level).filter(g => (g.kind === 'choose' || g.kind === 'pick') && g.level >= 4 && g.options && g.options.length >= 2), rng(seed));
}

/** Progress per game from stored sessions (only real results). */
export type SessionRow = {kind: string; score: number; total: number; created_at: string; details?: {wrong?: string[]; lang?: string; level?: string} | null};
export function progressOf(rows: SessionRow[], lang: string) {
  const by: Record<string, {sessions: number; answered: number; correct: number; last: string; wrong: Map<string, number>}> = {};
  for (const s of rows) {
    if (s.details?.lang && s.details.lang !== lang) continue;              // never mix languages
    const p = by[s.kind] || (by[s.kind] = {sessions: 0, answered: 0, correct: 0, last: '', wrong: new Map()});
    p.sessions++; p.answered += s.total || 0; p.correct += s.score || 0; if (s.created_at > p.last) p.last = s.created_at;
    for (const w of s.details?.wrong || []) if (typeof w === 'string' && w.trim()) p.wrong.set(w, (p.wrong.get(w) || 0) + 1);
  }
  return Object.fromEntries(Object.entries(by).map(([k, p]) => [k, {sessions: p.sessions, answered: p.answered, correct: p.correct, last: p.last,
    pct: p.answered ? Math.round(p.correct / p.answered * 100) : null, often: [...p.wrong.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w)}]));
}
