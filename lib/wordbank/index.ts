// Built-in word bank (no AI, no database): parsing, filters, random rounds. One structure, data per language:
// Dutch (nl.ts) and Brazilian Portuguese (pt.ts). v42: a language is loaded only when needed (loadBank), every
// item carries an English translation (flashcards) and its grammar (article, gender, word class) is derived locally.
import {cleanTaboo} from '../vocab/core.ts';
import type {BankCat, BankData, BankItem, BankLevel} from './types.ts';
export type {BankCat, BankItem, BankLevel} from './types.ts';

export const BANK_LEVELS: BankLevel[] = ['A1', 'A2', 'B1', 'B2'];
/** In the order shown in the menu. */
export const BANK_CATS: BankCat[] = ['life', 'food', 'work', 'travel', 'hobby', 'family', 'animals', 'nature', 'feelings', 'verb', 'adjective', 'abstract', 'expression', 'saying', 'proverb'];
/** Dutch labels (translated in the interface). */
export const CAT_LABEL: Record<BankCat | 'all', string> = {
  all: 'Alles', life: 'Dagelijks leven', food: 'Eten en drinken', work: 'Werk en studie', travel: 'Reizen', hobby: "Sport en hobby's",
  family: 'Familie en relaties', animals: 'Dieren', nature: 'Natuur', feelings: 'Gevoelens', verb: 'Werkwoorden', adjective: 'Bijvoeglijke naamwoorden', abstract: 'Abstracte begrippen',
  expression: 'Uitdrukkingen', saying: 'Gezegdes', proverb: 'Spreekwoorden',
};
export const LEVEL_LABEL: Record<BankLevel | 'mix', string> = {mix: 'Gemengd', A1: 'A1', A2: 'A2', B1: 'B1', B2: 'B2'};

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** The id depends only on language + term, so it stays the same when an item moves to another level or category. */
export function parseBank(lang: string, data: BankData): BankItem[] {
  const out: BankItem[] = [];
  for (const level of BANK_LEVELS) for (const cat of BANK_CATS) {
    for (const line of (data[level]?.[cat] || '').split('\n')) {
      const [term, taboo = '', meaning = '', en = ''] = line.split('|').map(x => x.trim());
      if (!term) continue;
      out.push({id: `${lang}-${slug(term)}`, lang, term, level, cat, meaning, en, taboo: cleanTaboo(term, taboo.split(',').map(x => x.trim()).filter(Boolean), 3)});
    }
  }
  return out;
}
/** Languages with a built-in bank; each file is only loaded (and parsed) when that language is used. */
const LOADERS: Record<string, () => Promise<BankData>> = {
  nl: () => import('./nl.ts').then(m => m.NL),
  pt: () => import('./pt.ts').then(m => m.PT),
};
export const BANKS: Record<string, BankItem[]> = {};
const loading: Record<string, Promise<BankItem[]>> = {};
export function loadBank(lang: string | null | undefined): Promise<BankItem[]> {
  const l = String(lang || '');
  if (BANKS[l]) return Promise.resolve(BANKS[l]);
  if (!LOADERS[l]) return Promise.resolve([]);
  if (!loading[l]) loading[l] = LOADERS[l]().then(d => (BANKS[l] = parseBank(l, d)));
  return loading[l];
}
/** A built-in bank exists for this lesson language (Dutch, Brazilian Portuguese). */
export const hasBank = (lang: string | null | undefined) => !!LOADERS[String(lang || '')];
/** Grammar line in the lesson language: "zelfstandig naamwoord · het", "substantivo feminino", "verbo"… Derived from the
 *  article and the category, so it never has to be stored or generated. Empty when it cannot be known for sure. */
export function bankGrammar(w: Pick<BankItem, 'lang' | 'term' | 'cat'>): string {
  const t = w.term.toLowerCase();
  if (w.lang === 'pt') {
    if (/^(o|os) /.test(t)) return 'substantivo masculino';
    if (/^(a|as) /.test(t)) return 'substantivo feminino';
    if (w.cat === 'verb') return 'verbo';
    if (w.cat === 'adjective') return 'adjetivo';
    if (w.cat === 'expression' || w.cat === 'saying' || w.cat === 'proverb') return 'expressão';
    return '';
  }
  if (w.lang === 'nl') {
    const a = /^(de|het) /.exec(t); if (a) return 'zelfstandig naamwoord · ' + a[1];
    if (w.cat === 'verb') return 'werkwoord';
    if (w.cat === 'adjective') return 'bijvoeglijk naamwoord';
    if (w.cat === 'expression' || w.cat === 'saying' || w.cat === 'proverb') return 'uitdrukking';
  }
  return '';
}
/** Target language of a student (same rule as the server's subjectCode). */
export function bankLangFor(s: {curriculum_subject?: string | null; subject?: string | null; lesson_language?: string | null}) {
  if (s.curriculum_subject) return s.curriculum_subject;
  if (/portug/i.test(s.subject || '')) return 'pt';
  if (/nederl|dutch|nt2/i.test(s.subject || '')) return 'nl';
  return s.lesson_language || 'nl';
}

/** v41: compare a personal word with a bank word ("De fiets" = "fiets" = "de fiets"). */
export const termKey = (s: string) => String(s || '').toLowerCase().trim().replace(/^(de|het|een|the|a|an|o|a|os|as|el|la|los|las|le|les|l'|der|die|das)\s+/, '').replace(/\s+/g, ' ');

export type BankFilter ={level: BankLevel | 'mix'; cat: BankCat | 'all'; minTaboo?: number};
export const isLevel = (x: unknown): x is BankLevel | 'mix' => x === 'mix' || (BANK_LEVELS as unknown[]).includes(x);
export const isCat = (x: unknown): x is BankCat | 'all' => x === 'all' || (BANK_CATS as unknown[]).includes(x);
export function bankPool(lang: string, f: BankFilter): BankItem[] {
  return (BANKS[lang] || []).filter(w => (f.level === 'mix' || w.level === f.level) && (f.cat === 'all' || w.cat === f.cat) && w.taboo.length >= (f.minTaboo || 0));
}
/** A wider selection when there are too few words: first all categories, then all levels. Never silently. */
export function widen(f: BankFilter): BankFilter | null {
  if (f.cat !== 'all') return {...f, cat: 'all'};
  if (f.level !== 'mix') return {...f, level: 'mix'};
  return null;
}
/** n different items; words not used earlier in this session first (random order), used ones only when needed. */
export function pickBank(pool: BankItem[], n: number, used: Set<string>, rnd: () => number = Math.random): BankItem[] {
  const shuffle = (a: BankItem[]) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  const fresh = shuffle(pool.filter(w => !used.has(w.id))), old = shuffle(pool.filter(w => used.has(w.id)));
  return [...fresh, ...old].slice(0, n);
}
