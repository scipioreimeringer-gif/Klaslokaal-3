// v40: compact grammar labels for vocabulary (pure, unit-tested): "📘 het brood · znw.", "⚡ lopen · ww.",
// "🎨 mooi · bnw.", "💬 ik heb honger · uitdrukking". Labels follow the explanation language; the grammar itself
// (article, plural) follows the lesson language. Fits the existing vocab `pos` column (max 40 characters).
export type PosKind = 'noun' | 'verb' | 'adjective' | 'adverb' | 'expression' | 'sentence' | 'other';
export const POS_KINDS: PosKind[] = ['noun', 'verb', 'adjective', 'adverb', 'expression', 'sentence', 'other'];

const L: Record<string, Record<PosKind, string> & {pl: string}> = {
  nl: {noun: 'znw.', verb: 'ww.', adjective: 'bnw.', adverb: 'bijw.', expression: 'uitdrukking', sentence: 'voorbeeldzin', other: '', pl: 'mv.'},
  en: {noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', expression: 'expression', sentence: 'example sentence', other: '', pl: 'pl.'},
  pt: {noun: 'subst.', verb: 'verbo', adjective: 'adj.', adverb: 'adv.', expression: 'expressão', sentence: 'frase-exemplo', other: '', pl: 'pl.'},
  es: {noun: 'sust.', verb: 'verbo', adjective: 'adj.', adverb: 'adv.', expression: 'expresión', sentence: 'frase de ejemplo', other: '', pl: 'pl.'},
  fr: {noun: 'nom', verb: 'verbe', adjective: 'adj.', adverb: 'adv.', expression: 'expression', sentence: 'phrase exemple', other: '', pl: 'pl.'},
  de: {noun: 'Subst.', verb: 'Verb', adjective: 'Adj.', adverb: 'Adv.', expression: 'Ausdruck', sentence: 'Beispielsatz', other: '', pl: 'Pl.'},
};
export const ICON: Record<PosKind, string> = {noun: '📘', verb: '⚡', adjective: '🎨', adverb: '', expression: '💬', sentence: '💬', other: ''};

/** "znw. · het · mv. broden" — article and plural only for nouns, never more than 40 characters. */
export function grammarLabel(g: {pos: string; article?: string; plural?: string}, lang = 'nl'): string {
  const t = L[lang] || L.en; const pos = (POS_KINDS as string[]).includes(g.pos) ? g.pos as PosKind : 'other';
  const parts = [t[pos]];
  if (pos === 'noun') { const a = (g.article || '').trim(); const p = (g.plural || '').trim(); if (a) parts.push(a.slice(0, 8)); if (p) parts.push(`${t.pl} ${p}`.slice(0, 24)); }
  return parts.filter(Boolean).join(' · ').slice(0, 40);
}

/** Icon for a stored label (any language). Old words without a label simply get none. */
export function posIcon(label: string | null | undefined): string {
  const s = String(label || '').toLowerCase().split('·')[0].trim(); if (!s) return '';
  for (const t of Object.values(L)) for (const k of POS_KINDS) if (t[k] && t[k].toLowerCase() === s) return ICON[k];
  return '';
}
