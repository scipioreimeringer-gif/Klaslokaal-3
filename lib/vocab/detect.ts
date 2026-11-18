// Canvas word recognition: deterministic candidates (lib/vocab/core) + one small AI check per changed page.
// The AI never writes a term itself: it can only keep or drop a candidate by index, so the original
// spelling from the canvas is always preserved. Database and AI are injected → unit-testable.
import {z} from 'zod';
import {canvasBlocks, candidatesFrom, mergeCandidates, newOnly, pageHash, words, type Candidate} from './core.ts';
import {grammarLabel} from './grammar.ts';

export const VocabCheckSchema = z.object({
  items: z.array(z.object({
    index: z.number().describe('index of the candidate'),
    keep: z.boolean().describe('true only for a word or fixed expression a learner should study; false for instructions, names, dates, headings, grammar labels, sentences'),
    translation: z.string().describe('short meaning in the explanation language; for several meanings: "meaning 1; meaning 2"'),
    pos: z.enum(['noun', 'verb', 'adjective', 'adverb', 'expression', 'sentence', 'other']).describe('word class; "expression" for a fixed multi-word expression, "sentence" for a useful example sentence'),
    article: z.string().describe('nouns in a language with articles: the definite article of the singular as used in the lesson language (e.g. de/het, o/a, el/la, le/la, der/die/das); else empty'),
    plural: z.string().describe('nouns: the plural form in the lesson language when useful for the level; else empty'),
    kind: z.enum(['word', 'expression']),
  })),
});
export type Ask = <S extends z.ZodType>(schema: S, system: string, user: string) => Promise<z.infer<S>>;
export type Suggestion = Candidate & {pos: string};
export type Page = {id?: string; title: string; html: string};

/** No AI needed: every candidate is an explicit "term = translation" pair of at most 3 words without digits. */
const obvious = (c: Candidate[]) => c.length > 0 && c.every(x => x.reason === 'pair' && x.translation && words(x.term).length <= 3 && !/\d/.test(x.term));

export async function detectPages(pages: Page[], opts: {existing: string[]; scanned: Set<string>; targetName: string; explainName: string; level: string; ask: Ask; maxCandidates?: number; explainCode?: string}) {
  const hashes: {hash: string; found: number}[] = []; let all: Candidate[] = []; let aiCalls = 0;
  for (const p of pages) {
    const blocks = canvasBlocks(p.html); const text = blocks.map(b => b.text).join('\n');
    if (!text.trim()) continue;
    const hash = pageHash(text); if (opts.scanned.has(hash)) continue; // unchanged page: no new work, no AI cost
    const cands = newOnly(mergeCandidates(candidatesFrom(blocks, p.title || '')), [...opts.existing, ...all.map(c => c.term)]).slice(0, opts.maxCandidates || 60);
    let kept: Suggestion[] = [];
    if (cands.length && obvious(cands)) kept = cands.map(c => ({...c, pos: ''}));
    else if (cands.length) {
      aiCalls++;
      const r = await opts.ask(VocabCheckSchema, [
        `You check text from a ${opts.targetName} lesson canvas (student level ${opts.level}). Decide for each numbered candidate whether it is vocabulary to study (a word or a fixed expression).`,
        'keep=false for: instructions, headings, names of people, dates, numbers, grammar terms or explanations, full sentences, exercise numbering, words in another language than the target language.',
        `translation: short meaning in ${opts.explainName}. If the candidate already has a meaning written on the canvas, keep that meaning. Words with several meanings: give them separated by "; ".`,
        'Never change or correct the candidate itself.',
        `Grammar (v40): pos = word class. For nouns give the singular definite article and, from level A2, the plural, following ${opts.targetName} grammar (empty when the language has no articles). Keep it short.`,
      ].join('\n'), JSON.stringify({candidates: cands.map((c, i) => ({index: i, text: c.term, meaning_on_canvas: c.translation || null, next_line: c.example || null}))}));
      const byIdx = new Map(r.items.map(x => [x.index, x]));
      const early = /^(A0|A1)$/.test(opts.level);
      kept = cands.flatMap((c, i) => { const x = byIdx.get(i); return x?.keep ? [{...c, translation: c.translation || x.translation.trim().slice(0, 300),
        pos: grammarLabel({pos: x.pos, article: x.article, plural: early ? '' : x.plural}, opts.explainCode || 'en'), kind: x.kind}] : []; });
    }
    all = [...all, ...kept]; hashes.push({hash, found: kept.length});
  }
  return {suggestions: mergeCandidates(all) as Suggestion[], hashes, aiCalls};
}
