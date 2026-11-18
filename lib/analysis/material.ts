// v40: what an approved lesson summary offers for homework (pure, unit-tested). Works for both analysis versions.
// v1 stores loose `corrections`; v2 stores `categories` with verbatim examples (before v40 the exercise generator
// only read v1 corrections, so v2 errors were silently ignored). Teacher-confirmed "Lesonderwerpen" come first.
export type LessonTopics = {grammar: string[]; vocab: string[]; errors: string[]; repeat: string[]; instructions: string; confirmed_at?: string | null};
export type Material = {errors: {original: string; corrected: string; category: string}[]; grammar: string[]; vocab: string[]; repeat: string[]; instructions: string; confirmed: boolean};

type Doc = {
  version?: number;
  corrections?: {original?: string; corrected?: string; category?: string; certainty?: string}[];
  grammar?: {topic?: string}[];
  vocabulary?: {term?: string}[];
  report?: {covered?: string[]} | null;
  categories?: {label?: string; relevance?: string; recurring?: boolean; examples?: {original?: string; corrected?: string; certainty?: string}[]}[];
  lesson_topics?: LessonTopics | null;
};
const uniq = (a: string[], n: number) => Array.from(new Set(a.map(s => String(s || '').trim()).filter(Boolean))).slice(0, n);

export function lessonMaterial(docs: unknown[]): Material {
  const errors: Material['errors'] = []; const grammar: string[] = [], vocab: string[] = [], repeat: string[] = []; let instructions = ''; let confirmed = false;
  for (const raw of docs) {
    const d = (raw || {}) as Doc;
    const t = d.lesson_topics;
    if (t && t.confirmed_at) { confirmed = true; grammar.push(...(t.grammar || [])); vocab.push(...(t.vocab || [])); repeat.push(...(t.repeat || [])); if (!instructions && t.instructions) instructions = t.instructions;
      errors.push(...(t.errors || []).map(e => ({original: e, corrected: '', category: 'teacher'}))); }
    if (d.version === 2) {
      for (const c of d.categories || []) {
        if (c.relevance === 'later') continue; // not covered yet: never homework
        const e = (c.examples || []).find(x => x.certainty !== 'uncertain' && x.original && x.corrected);
        if (e) errors.push({original: e.original!, corrected: e.corrected!, category: c.label || ''});
        if (c.recurring && c.label) repeat.push(c.label);
      }
      grammar.push(...(d.report?.covered || []));
      vocab.push(...(d.vocabulary || []).map(v => v.term || ''));
    } else {
      for (const c of d.corrections || []) if (c.original && c.corrected && c.certainty !== 'uncertain') errors.push({original: c.original, corrected: c.corrected, category: c.category || ''});
      grammar.push(...(d.grammar || []).map(g => g.topic || ''));
    }
  }
  const seen = new Set<string>();
  const errs = errors.filter(e => { const k = e.original.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 20);
  return {errors: errs, grammar: uniq(grammar, 12), vocab: uniq(vocab, 40), repeat: uniq(repeat, 8), instructions: instructions.slice(0, 600), confirmed};
}

/** AI proposal for the teacher's "Lesonderwerpen" box, from the analysis itself (no extra AI call). */
export function proposeTopics(raw: unknown): LessonTopics {
  const m = lessonMaterial([{...(raw as object), lesson_topics: null}]);
  return {grammar: m.grammar, vocab: m.vocab.slice(0, 20), errors: m.errors.map(e => e.corrected ? `${e.original} → ${e.corrected}` : e.original).slice(0, 8), repeat: m.repeat, instructions: '', confirmed_at: null};
}
