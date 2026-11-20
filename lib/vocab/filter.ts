// v44: filters for the central word list ("Woorden"): lesson language, word class, level, lesson, learning status.
// Pure and unit-tested; the same rows are shown per lesson (no second copy of a word).
import {posKindOf, POS_GROUP_ORDER, type PosKind} from './grammar.ts';

export type VocabRow = {term: string; translation?: string | null; example?: string | null; status: string; lang?: string | null; pos?: string | null; level?: string | null; lesson_date?: string | null;
  /** v46: every lesson the word appeared in (central word list); falls back to lesson_date */ lesson_dates?: string[]};
const datesOf = (i: VocabRow) => i.lesson_dates && i.lesson_dates.length ? i.lesson_dates : i.lesson_date ? [i.lesson_date] : [];
export type VocabFilter = {lang: string; pos: 'all' | PosKind; level: string; lesson: string};
const LEVEL_ORDER = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function filterVocab<T extends VocabRow>(items: T[], f: Partial<VocabFilter> & {status?: string; q?: string}): T[] {
  const q = (f.q || '').trim().toLowerCase();
  return items.filter(i =>
    (!f.status || f.status === 'all' || i.status === f.status) &&
    (!f.lang || f.lang === 'all' || (i.lang || '').slice(0, 2) === f.lang) &&
    (!f.pos || f.pos === 'all' || posKindOf(i.pos) === f.pos) &&
    (!f.level || f.level === 'all' || i.level === f.level) &&
    (!f.lesson || f.lesson === 'all' || datesOf(i).includes(f.lesson)) &&
    (!q || (i.term + ' ' + (i.translation || '') + ' ' + (i.example || '')).toLowerCase().includes(q)));
}

/** Only the filter values that really occur in this list (no empty choices). */
export function vocabFacets(items: VocabRow[]) {
  const uniq = <X,>(a: X[]) => Array.from(new Set(a));
  return {
    langs: uniq(items.map(i => (i.lang || '').slice(0, 2)).filter(Boolean)).sort(),
    pos: POS_GROUP_ORDER.filter(k => items.some(i => posKindOf(i.pos) === k)),
    levels: LEVEL_ORDER.filter(l => items.some(i => i.level === l)),
    lessons: uniq(items.flatMap(datesOf)).sort().reverse(),
  };
}
