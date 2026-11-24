// Canvas word recognition: deterministic candidates (lib/vocab/core) + small AI checks per changed page.
// The AI never writes a term itself: it can only keep or drop a candidate by index, so the original
// spelling from the canvas is always preserved. Database and AI are injected → unit-testable.
// v62: grammar per word (language-aware), batches of 40 (long historical lists are no longer cut off at 60),
// one page or all pages, and a count of words that were already known.
import {z} from 'zod';
import {canvasBlocks, candidatesFrom, mergeCandidates, normTerm, pageHash, words, type Candidate} from './core.ts';
import {grammarLabel} from './grammar.ts';

const s = (d: string) => z.string().describe(d);
export const VocabCheckSchema = z.object({
  items: z.array(z.object({
    index: z.number().describe('index of the candidate'),
    keep: z.boolean().describe('true only for a word or fixed expression a learner should study; false for instructions, names, dates, headings, grammar labels, sentences, and single conjugated forms copied from a conjugation table (keep only the infinitive)'),
    translation: s('short meaning in the explanation language; for several meanings: "meaning 1; meaning 2"'),
    pos: z.enum(['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'expression', 'sentence', 'other']).describe('word class decided from the context on the canvas'),
    base: s('base form: noun singular WITHOUT article, verb infinitive, adjective base form; else the term'),
    article: s('nouns: definite article of the singular in the lesson language (de/het, o/a, …); else empty'),
    plural: s('nouns: plural form; else empty'),
    gender: s('nouns in languages with grammatical gender (e.g. Portuguese): "m" or "f"; else empty'),
    present: s('verbs: present tense, short ("loopt" for Dutch 3rd person; Portuguese: "eu falo, ele fala"); else empty'),
    past_sg: s('verbs: past tense singular (Dutch imperfectum; Portuguese pretérito perfeito "eu falei"); else empty'),
    past_pl: s('verbs: past tense plural (Dutch only); else empty'),
    participle: s('verbs: past participle; else empty'),
    aux: z.enum(['H', 'Z', 'H/Z', '']).describe('Dutch verbs only: perfect auxiliary hebben = H, zijn = Z, both depending on meaning = H/Z; empty for other languages'),
    aux_note: s('only when aux is H/Z: short note when hebben vs zijn is used; else empty'),
    separable: z.enum(['yes', 'no', '']).describe('Dutch verbs with a prefix: separable or not; else empty'),
    conj_present: z.array(z.string()).describe('verbs: full present tense, one form per person in the usual order of the lesson language (6 forms); else []'),
    conj_past: z.array(z.string()).describe('verbs: full past tense (Dutch imperfectum / Portuguese pretérito perfeito), 6 forms; else []'),
    inflected: s('adjectives: inflected form when the language has one (Dutch "mooie"); else empty'),
    comparative: s('adjectives: comparative; else empty'),
    superlative: s('adjectives: superlative; else empty'),
    kind: z.enum(['word', 'expression']),
  })),
});
export type Ask = <S extends z.ZodType>(schema: S, system: string, user: string) => Promise<z.infer<S>>;
export type Grammar = {base?: string; article?: string; plural?: string; gender?: string; present?: string; past_sg?: string; past_pl?: string; participle?: string;
  aux?: string; aux_note?: string; separable?: string; conj_present?: string[]; conj_past?: string[]; inflected?: string; comparative?: string; superlative?: string; pos?: string};
export type Suggestion = Candidate & {pos: string; grammar?: Grammar | null};
export type Page = {id?: string; title: string; html: string};

const BATCH = 40, MAX_PER_PAGE = 600;
/** No AI needed: every candidate is an explicit "term = translation" pair of at most 3 words without digits. */
const obvious = (c: Candidate[]) => c.length > 0 && c.every(x => x.reason === 'pair' && x.translation && words(x.term).length <= 3 && !/\d/.test(x.term));
const cap = (v: unknown, n = 80) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** Server-side validation of the AI grammar: only short strings, only fields that fit the word class and language. */
export function cleanGrammar(x: z.infer<typeof VocabCheckSchema>['items'][number], targetCode: string): Grammar | null {
  const g: Grammar = {pos: x.pos, base: cap(x.base)};
  const nl = targetCode === 'nl';
  if (x.pos === 'noun') { g.article = cap(x.article, 8); g.plural = cap(x.plural); if (!nl) g.gender = /^(m|f)$/.test(x.gender) ? x.gender : ''; }
  if (x.pos === 'verb') {
    g.present = cap(x.present, 120); g.past_sg = cap(x.past_sg, 120); g.participle = cap(x.participle);
    if (nl) { g.past_pl = cap(x.past_pl); g.aux = ['H', 'Z', 'H/Z'].includes(x.aux) ? x.aux : ''; g.aux_note = g.aux === 'H/Z' ? cap(x.aux_note, 160) : ''; g.separable = ['yes', 'no'].includes(x.separable) ? x.separable : ''; }
    const six = (a: string[]) => Array.isArray(a) && a.length >= 5 && a.length <= 8 && a.every(f => typeof f === 'string' && f.trim() && f.length <= 60) ? a.map(f => f.trim()) : undefined;
    g.conj_present = six(x.conj_present); g.conj_past = six(x.conj_past);
  }
  if (x.pos === 'adjective') { g.inflected = nl ? cap(x.inflected) : ''; g.comparative = cap(x.comparative); g.superlative = cap(x.superlative); }
  for (const k of Object.keys(g) as (keyof Grammar)[]) if (g[k] === '' || g[k] === undefined) delete g[k];
  return Object.keys(g).length > 1 ? g : null;
}

export async function detectPages(pages: Page[], opts: {existing: string[]; scanned: Set<string>; targetName: string; explainName: string; level: string; ask: Ask;
  maxCandidates?: number; explainCode?: string; targetCode?: string; force?: boolean; enrich?: Set<string>}) {
  const hashes: {hash: string; found: number}[] = []; let all: Suggestion[] = []; let aiCalls = 0, known = 0;
  const have = new Set(opts.existing.map(normTerm));
  for (const p of pages) {
    const blocks = canvasBlocks(p.html); const text = blocks.map(b => b.text).join('\n');
    if (!text.trim()) continue;
    const hash = pageHash(text); if (!opts.force && opts.scanned.has(hash)) continue; // unchanged page: no new work, no AI cost
    const merged = mergeCandidates(candidatesFrom(blocks, p.title || ''));
    // known words are counted; the ones still without grammar (enrich) are checked again so they get it once
    const cands = merged.filter(c => { const k = normTerm(c.term); if (all.some(a => normTerm(a.term) === k)) return false; if (have.has(k)) { known++; return !!opts.enrich?.has(k); } return true; })
      .slice(0, opts.maxCandidates || MAX_PER_PAGE);
    let kept: Suggestion[] = [];
    if (cands.length && obvious(cands) && !opts.enrich?.size) kept = cands.map(c => ({...c, pos: ''}));
    else for (let i = 0; i < cands.length; i += BATCH) {
      const batch = cands.slice(i, i + BATCH); aiCalls++;
      const r = await opts.ask(VocabCheckSchema, [
        `You check text from a ${opts.targetName} lesson canvas (student level ${opts.level}). Decide for each numbered candidate whether it is vocabulary to study (a word or a fixed expression).`,
        'keep=false for: instructions, headings, names of people, dates, numbers, grammar terms or explanations, full sentences, exercise numbering, words in another language than the target language, single conjugated forms from a conjugation table.',
        `translation: short meaning in ${opts.explainName}. If the candidate already has a meaning written on the canvas, keep that meaning. Words with several different meanings: separate them with "; ".`,
        'Never change or correct the candidate itself. Decide the word class from the context (the same word can be a noun or a verb).',
        `Grammar strictly following ${opts.targetName} grammar (never apply Dutch rules to another language): nouns article/plural${opts.targetCode === 'nl' ? '' : '/gender'}; verbs infinitive, present, past, participle${opts.targetCode === 'nl' ? ', hebben/zijn as H, Z or H/Z with a short note, separable' : ''}, full present and past conjugation; adjectives comparative/superlative${opts.targetCode === 'nl' ? ' and inflected form' : ''}. Leave fields empty when not applicable.`,
      ].join('\n'), JSON.stringify({candidates: batch.map((c, k) => ({index: k, text: c.term, meaning_on_canvas: c.translation || null, next_line: c.example || null}))}));
      const byIdx = new Map(r.items.map(x => [x.index, x]));
      const early = /^(A0|A1)$/.test(opts.level);
      kept = [...kept, ...batch.flatMap((c, k) => { const x = byIdx.get(k); return x?.keep ? [{...c, translation: c.translation || x.translation.trim().slice(0, 300),
        pos: grammarLabel({pos: x.pos, article: x.article, plural: early ? '' : x.plural}, opts.explainCode || 'en', opts.targetCode || ''), kind: x.kind, grammar: cleanGrammar(x, opts.targetCode || '')}] : []; })];
    }
    all = [...all, ...kept]; hashes.push({hash, found: kept.length});
  }
  return {suggestions: all, hashes, aiCalls, known};
}
