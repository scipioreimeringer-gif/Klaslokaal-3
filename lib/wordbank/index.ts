// Built-in word bank (no AI, no database): parsing, filters, random rounds. Extensible per language.
import {cleanTaboo} from '../vocab/core.ts';
import {NL} from './nl.ts';
import type {BankCat, BankData, BankItem, BankLevel} from './types.ts';
export type {BankCat, BankItem, BankLevel} from './types.ts';

export const BANK_LEVELS: BankLevel[] = ['A1', 'A2', 'B1', 'B2'];
/** In the order shown in the menu. */
export const BANK_CATS: BankCat[] = ['life', 'food', 'work', 'travel', 'hobby', 'family', 'verb', 'adjective', 'abstract', 'expression', 'saying', 'proverb'];
/** Dutch labels (translated in the interface). */
export const CAT_LABEL: Record<BankCat | 'all', string> = {
  all: 'Alles', life: 'Dagelijks leven', food: 'Eten en drinken', work: 'Werk en studie', travel: 'Reizen', hobby: "Sport en hobby's",
  family: 'Familie en relaties', verb: 'Werkwoorden', adjective: 'Bijvoeglijke naamwoorden', abstract: 'Abstracte begrippen',
  expression: 'Uitdrukkingen', saying: 'Gezegdes', proverb: 'Spreekwoorden',
};
export const LEVEL_LABEL: Record<BankLevel | 'mix', string> = {mix: 'Gemengd', A1: 'A1', A2: 'A2', B1: 'B1', B2: 'B2'};

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** The id depends only on language + term, so it stays the same when an item moves to another level or category. */
export function parseBank(lang: string, data: BankData): BankItem[] {
  const out: BankItem[] = [];
  for (const level of BANK_LEVELS) for (const cat of BANK_CATS) {
    for (const line of (data[level]?.[cat] || '').split('\n')) {
      const [term, taboo = '', meaning = ''] = line.split('|').map(x => x.trim());
      if (!term) continue;
      out.push({id: `${lang}-${slug(term)}`, lang, term, level, cat, meaning, taboo: cleanTaboo(term, taboo.split(',').map(x => x.trim()).filter(Boolean), 3)});
    }
  }
  return out;
}
export const BANKS: Record<string, BankItem[]> = {nl: parseBank('nl', NL)};
export const hasBank = (lang: string | null | undefined) => !!BANKS[String(lang || '')]?.length;
/** Target language of a student (same rule as the server's subjectCode). */
export function bankLangFor(s: {curriculum_subject?: string | null; subject?: string | null; lesson_language?: string | null}) {
  if (s.curriculum_subject) return s.curriculum_subject;
  if (/portug/i.test(s.subject || '')) return 'pt';
  if (/nederl|dutch|nt2/i.test(s.subject || '')) return 'nl';
  return s.lesson_language || 'nl';
}

export type BankFilter = {level: BankLevel | 'mix'; cat: BankCat | 'all'; minTaboo?: number};
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
