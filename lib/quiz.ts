// v67: quality rules for practice questions (pure, unit-tested, no AI, no database).
// - Multiple choice: always exactly four unique options, exactly one correct; distractors of the same word class,
//   the same language (all translations, or all terms) and a similar form/length — never random words.
// - Word-bank records that contain several unrelated concepts ("Receita Federal / está aberta / …") are left out of
//   quiz, match and typing games (the record itself stays untouched in the word list).
// - Explanation language: separate from the interface language (default English for learners of Dutch).

const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^(de|het|een|o|a|os|as|um|uma|to|the)\s+/, '').replace(/[.,!?;:"“”'’()]/g, '').replace(/\s+/g, ' ').trim();

/** One word or one meaningful fixed expression — not a list of unrelated things. */
export function singleConcept(term: string, kind?: string | null): boolean {
  const s = String(term || '').trim();
  if (!s || s.length > 60) return false;
  if (/\s[\/|;]\s|;|\|/.test(s)) return false;                         // "A / B / C", "A; B"
  if ((s.match(/,/g) || []).length >= 2) return false;                  // "a, b, c"
  const words = s.split(/\s+/).length;
  return words <= (kind === 'expression' ? 8 : 5);
}
/** A translation may list synonyms ("to remember / to recall"); the first one is shown in a quiz option. */
export const firstMeaning = (s: string) => String(s || '').split(/\s*[\/;]\s*|,\s+/)[0].trim();
/** All accepted variants of a stored answer ("de fiets / het rijwiel" → both, with and without article). */
export function answerVariants(s: string): string[] {
  const parts = String(s || '').split(/\s*[\/;]\s*/).map(x => x.trim()).filter(Boolean);
  const out = new Set<string>();
  for (const p of parts) { out.add(p); out.add(p.replace(/^(de|het|een|o|a|os|as|um|uma|to)\s+/i, '')); out.add(p.replace(/\s*\([^)]*\)\s*/g, ' ').trim()); }
  return [...out].filter(Boolean);
}

export type WClass = 'noun' | 'verb' | 'adjective' | 'adverb' | 'expression' | 'other' | '';
/** Word class from the stored label, else from the form (English "to …" = verb, an article = noun). */
export function wordClass(c: {term: string; meaning?: string; pos?: string | null}): WClass {
  const p = String(c.pos || '').toLowerCase();
  if (/noun|zelfst|substant|^(life|food|work|travel|hobby|family|animals|nature)$/.test(p)) return 'noun';
  if (/verb|werkw/.test(p) && !/adverb|bijw/.test(p)) return 'verb';
  if (/adj|bijvoeg/.test(p)) return 'adjective';
  if (/adverb|bijw/.test(p)) return 'adverb';
  if (/expr|uitdr|saying|proverb|idiom/.test(p)) return 'expression';
  const t = String(c.term || '').trim(), m = String(c.meaning || '').trim();
  if (/^(de|het|o|a|os|as)\s+\S+$/i.test(t) || /^(the|a|an)\s+\S+$/i.test(m)) return 'noun';
  if (/^to\s+\S+/i.test(m)) return 'verb';
  if (t.split(/\s+/).length >= 3) return 'expression';
  return p ? 'other' : '';
}

/** Similarity of form: length, number of words, same beginning/ending — plausible alternatives score higher. */
function formScore(a: string, b: string) {
  const x = norm(a), y = norm(b); if (!x || !y) return 0;
  const len = 1 - Math.min(1, Math.abs(x.length - y.length) / Math.max(x.length, y.length));
  const wc = x.split(' ').length === y.split(' ').length ? 1 : 0;
  const head = x[0] === y[0] ? 0.4 : 0, tail = x.slice(-2) === y.slice(-2) ? 0.6 : 0;
  return 2 * len + wc + head + tail;
}

export type Option = {text: string; cls?: WClass};
/** Seeded random numbers; the seed is mixed first, so neighbouring seeds give unrelated sequences. */
function rand(seed: number) {
  let s = Math.imul((seed >>> 0) ^ 0x9e3779b9, 2654435761) >>> 0; s = Math.imul(s ^ (s >>> 15), 2246822519) >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
/** "the …" / "to …" / "a …": the visible form of a translation; options should share it. */
const lead = (s: string) => (/^(the|to|a|an)\s/i.exec(String(s || '').trim()) || [''])[0].toLowerCase();
/** Three distractors for `correct` from `pool`: same word class when known (required), similar form, never equal to
 *  or containing the answer, never a multi-concept record. Deterministic for a seed; fewer than 3 = not enough. */
export function pickDistractors(correct: Option, pool: Option[], seed: number, n = 3): string[] {
  const c = norm(correct.text), seen = new Set([c]), rnd = rand(seed), L = lead(correct.text);
  const scored = pool.map(o => ({o, t: firstMeaning(o.text)}))
    .filter(({o, t}) => { const k = norm(t); return k && k !== c && !k.includes(c) && !c.includes(k) && singleConcept(t, o.cls === 'expression' ? 'expression' : null); })
    .filter(({o}) => !correct.cls || !o.cls || o.cls === correct.cls || (correct.cls === 'other' || o.cls === 'other'))
    .map(({o, t}) => ({t, score: formScore(correct.text, t) + (correct.cls && o.cls === correct.cls ? 3 : 0) + (lead(t) === L ? 2 : -3) + rnd() * 1.2}))
    .sort((a, b) => b.score - a.score);
  const out: string[] = [];
  for (const x of scored) { if (out.length >= n) break; const k = norm(x.t); if (seen.has(k)) continue; seen.add(k); out.push(x.t); }
  return out;
}

/** Shuffle the correct answer into a random position (seeded). */
export function placeAnswer(correct: string, distractors: string[], seed: number): string[] {
  const all = [correct, ...distractors], rnd = rand(seed);
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all;
}

/** Structural check before a student sees a multiple-choice question. */
export function validMc(q: {prompt?: string; options?: string[]; answer: string}, need = 4): boolean {
  const o = (q.options || []).map(x => String(x || '').trim());
  if (o.length !== need || o.some(x => !x || /\bundefined\b|\bnull\b/.test(x))) return false;
  const k = o.map(x => x.toLowerCase());
  if (new Set(k).size !== need) return false;
  return k.filter(x => x === String(q.answer || '').trim().toLowerCase()).length === 1;
}

/* ---------------- explanation language ---------------- */
export const EXPLAIN_LANGS = ['en', 'nl', 'pt', 'es', 'fr', 'de'] as const;
export type ExplainLang = typeof EXPLAIN_LANGS[number];
/** Default: English for learners of Dutch; otherwise the interface language (e.g. a Dutch speaker learning Portuguese). */
export function defaultExplainLang(learning: string, ui: string): ExplainLang {
  if (String(learning || '').startsWith('nl')) return 'en';
  return (EXPLAIN_LANGS as readonly string[]).includes(ui) ? ui as ExplainLang : 'en';
}
/** A note in the chosen explanation language: its own translation (alt), else the translated interface text;
 *  a note written only in the target language is shown only when that is the explanation language. */
export type NoteLike = {k: string; a?: string[]; alt?: Partial<Record<string, string>>; raw?: string};
export function noteText(n: NoteLike, lang: string, translate: (lang: string, key: string, args: string[]) => string): string {
  if (n.alt?.[lang]) return n.alt[lang]!;
  if (n.raw) return n.raw === lang ? n.k : (n.alt?.en || '');
  return translate(lang, n.k, n.a || []);
}
