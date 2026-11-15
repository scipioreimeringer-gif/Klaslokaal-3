// Verb conjugation drills for the games. Portuguese data comes from lib/portuguese.ts.
import {PERSONS as PT_PERSONS, TENSES as PT_TENSES, VERBS as PT_VERBS, conjugate as ptConjugate, type Tense as PtTense} from './portuguese.ts';

export type DrillItem = {verb: string; meaning: string; person: string; tense: string; answers: string[]};

// Dutch: persons ik / jij / hij-zij / wij; tenses presens, imperfectum, perfectum. Variants listed where common.
const NL_PERSONS = ['ik', 'jij', 'hij / zij', 'wij'];
type F = [string, string, string, string];
const NL: Record<string, {nl: string; pres: F; impf: F; aux: 'hebben' | 'zijn'; pp: string; alt?: Partial<Record<'pres' | 'impf', Record<number, string[]>>>}> = {
  zijn: {nl: 'to be', pres: ['ben', 'bent', 'is', 'zijn'], impf: ['was', 'was', 'was', 'waren'], aux: 'zijn', pp: 'geweest'},
  hebben: {nl: 'to have', pres: ['heb', 'hebt', 'heeft', 'hebben'], impf: ['had', 'had', 'had', 'hadden'], aux: 'hebben', pp: 'gehad', alt: {pres: {1: ['heeft']}}},
  gaan: {nl: 'to go', pres: ['ga', 'gaat', 'gaat', 'gaan'], impf: ['ging', 'ging', 'ging', 'gingen'], aux: 'zijn', pp: 'gegaan'},
  komen: {nl: 'to come', pres: ['kom', 'komt', 'komt', 'komen'], impf: ['kwam', 'kwam', 'kwam', 'kwamen'], aux: 'zijn', pp: 'gekomen'},
  doen: {nl: 'to do', pres: ['doe', 'doet', 'doet', 'doen'], impf: ['deed', 'deed', 'deed', 'deden'], aux: 'hebben', pp: 'gedaan'},
  kunnen: {nl: 'can', pres: ['kan', 'kunt', 'kan', 'kunnen'], impf: ['kon', 'kon', 'kon', 'konden'], aux: 'hebben', pp: 'gekund', alt: {pres: {1: ['kan']}}},
  willen: {nl: 'to want', pres: ['wil', 'wilt', 'wil', 'willen'], impf: ['wilde', 'wilde', 'wilde', 'wilden'], aux: 'hebben', pp: 'gewild', alt: {pres: {1: ['wil']}, impf: {0: ['wou'], 1: ['wou'], 2: ['wou']}}},
  moeten: {nl: 'must', pres: ['moet', 'moet', 'moet', 'moeten'], impf: ['moest', 'moest', 'moest', 'moesten'], aux: 'hebben', pp: 'gemoeten'},
  maken: {nl: 'to make', pres: ['maak', 'maakt', 'maakt', 'maken'], impf: ['maakte', 'maakte', 'maakte', 'maakten'], aux: 'hebben', pp: 'gemaakt'},
  werken: {nl: 'to work', pres: ['werk', 'werkt', 'werkt', 'werken'], impf: ['werkte', 'werkte', 'werkte', 'werkten'], aux: 'hebben', pp: 'gewerkt'},
  zien: {nl: 'to see', pres: ['zie', 'ziet', 'ziet', 'zien'], impf: ['zag', 'zag', 'zag', 'zagen'], aux: 'hebben', pp: 'gezien'},
  eten: {nl: 'to eat', pres: ['eet', 'eet', 'eet', 'eten'], impf: ['at', 'at', 'at', 'aten'], aux: 'hebben', pp: 'gegeten'},
};
const AUX = {hebben: ['heb', 'hebt', 'heeft', 'hebben'], zijn: ['ben', 'bent', 'is', 'zijn']} as const;

export function nlForms(verb: string, tense: 'presens' | 'imperfectum' | 'perfectum'): string[][] {
  const v = NL[verb];
  return [0, 1, 2, 3].map(i => {
    if (tense === 'perfectum') return [`${AUX[v.aux][i]} ${v.pp}`];
    const key = tense === 'presens' ? 'pres' : 'impf';
    return [v[key][i], ...((v.alt?.[key]?.[i]) || [])];
  });
}

/** Deterministic pseudo-random drill set for a subject ('nl' or 'pt'). */
export function drillSet(subject: string, n: number, seed: number): DrillItem[] {
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out: DrillItem[] = [];
  if (subject === 'pt') {
    const verbs = Object.keys(PT_VERBS), tenses = Object.keys(PT_TENSES) as PtTense[];
    for (let k = 0; k < n; k++) { const verb = verbs[Math.floor(rnd() * verbs.length)], tense = tenses[Math.floor(rnd() * tenses.length)], p = Math.floor(rnd() * 4); out.push({verb, meaning: PT_VERBS[verb].nl, person: PT_PERSONS[p], tense: PT_TENSES[tense], answers: [ptConjugate(verb, tense)[p]]}); }
  } else if (subject === 'nl') {
    const verbs = Object.keys(NL), tenses = ['presens', 'imperfectum', 'perfectum'] as const;
    for (let k = 0; k < n; k++) { const verb = verbs[Math.floor(rnd() * verbs.length)], tense = tenses[Math.floor(rnd() * 3)], p = Math.floor(rnd() * 4); out.push({verb, meaning: NL[verb].nl, person: NL_PERSONS[p], tense, answers: nlForms(verb, tense)[p]}); }
  }
  return out;
}
export const hasDrills = (subject: string) => subject === 'pt' || subject === 'nl';

/** Fill-in-the-blank from an example sentence: blanks the term (case-insensitive, whole occurrence). */
export function blankSentence(example: string, term: string): string | null {
  const idx = example.toLowerCase().indexOf(term.toLowerCase());
  if (!term.trim() || idx < 0) return null;
  return example.slice(0, idx) + '_____' + example.slice(idx + term.length);
}
