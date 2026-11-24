// v66: reusable exercise templates per grammar topic (pure). The AI fills a proven structure instead of inventing one;
// every template names what the context must make unambiguous. Matched by keywords in the topic title (Dutch NT2
// topics and the memory's error categories). Other languages / unknown topics get the generic template.
export type Template = {id: string; type: 'fill_in' | 'conjugate' | 'multiple_choice' | 'correct_error' | 'make_sentence'; how: string};

const T: [RegExp, Template][] = [
  [/perfectum|voltooid|hulpwerkwoord|hebben\/zijn|deelwoord|auxiliary|participle/i, {id: 'perfect', type: 'conjugate', how: 'A short coherent story about a recent day (yesterday / last weekend). Each item is one sentence with a gap for the COMPLETE perfect form (auxiliary + participle), the infinitive in brackets after the gap. Time words (gisteren, vorige week) make the perfect tense clear. Mix hebben and zijn verbs.'}],
  [/imperfectum|verleden tijd|past_tense/i, {id: 'past', type: 'conjugate', how: 'A short story or description in the past (vroeger, toen ik klein was). Gap for the past tense form, infinitive in brackets. Context makes singular/plural and the past tense obvious.'}],
  [/tegenwoordige tijd|presens|present_tense|zijn, hebben/i, {id: 'present', type: 'conjugate', how: 'A daily routine of one person or a family. Gap for the present tense form with a clear subject in the sentence, infinitive in brackets. Include inversion items (Morgen ___ ik …) where the -t rule matters.'}],
  [/scheidbare|separable/i, {id: 'separable', type: 'conjugate', how: 'Sentences in main clause, with a modal verb and in the perfect, so the learner must split or keep the separable verb. Gap(s) for the verb parts, infinitive in brackets.'}],
  // bijzin before inversie: "Bijzinnen en woordvolgorde" is about subordinate clauses
  [/bijzin|voegwoord|subordinate|conjunction/i, {id: 'subclause', type: 'make_sentence', how: 'Prompt format: "Sentence A. + Sentence B. (conjunction)". Two short related sentences and a conjunction (omdat, dat, als, terwijl, …); the learner combines them into one sentence with the verb at the END of the subordinate clause. Accept main clause first or subordinate clause first.'}],
  [/inversie|zinsbouw|woordvolgorde|word_order|inversion|plaats 2|plek 2|hoofdzin|vraagzin/i, {id: 'word_order', type: 'make_sentence', how: 'Prompt format: "<label meaning start with, in the interface language>: <word>. <complete normal sentence starting with the subject>". The given start word MUST change the order (time/place word or question word), so subject and verb swap; keep the tense and all words of the given sentence, only the order changes; the learner rewrites the whole sentence with the verb in second position. Accept every correct word order.'}],
  [/lidwoord|de\/het|article|gender/i, {id: 'articles', type: 'fill_in', how: 'Natural sentences with one gap for de or het ONLY (never een) before a noun the learner knows, in a context that makes the noun definite (already mentioned, deze/die situation, a unique thing), so een is impossible. The noun is visible; the answer is only de or het.'}],
  [/adjectief|bijvoeglijk|buigings|adjective/i, {id: 'adjective', type: 'fill_in', how: 'Sentences with a noun phrase where the adjective is given in brackets in its base form and the learner writes the correct form (with or without -e). Include een + het-word cases.'}],
  [/meervoud|plural/i, {id: 'plural', type: 'fill_in', how: 'A sentence that clearly needs a plural (twee, veel, alle …) with a gap; the singular noun in brackets.'}],
  [/ontkenning|niet en geen|negation/i, {id: 'negation', type: 'make_sentence', how: 'Positive sentences the learner makes negative with niet or geen in the right place. Accept every correct position.'}],
  [/modale|modal/i, {id: 'modal', type: 'make_sentence', how: 'A situation (rules, wishes, abilities) and a modal verb; the learner writes one sentence with the modal in second position and the infinitive at the end.'}],
  [/comparatief|superlatief|comparison/i, {id: 'comparison', type: 'fill_in', how: 'Two or three things are compared in context (prices, ages, distances). Gap for the comparative or superlative; the base adjective in brackets.'}],
  [/\ber\b/i, {id: 'er', type: 'fill_in', how: 'Short natural sentences where er is needed (er is, er + number, er + preposition) with the gap where er belongs; context makes its function clear.'}],
  [/passief|passive/i, {id: 'passive', type: 'make_sentence', how: 'Active sentences the learner rewrites in the passive with worden/zijn; the tense of the active sentence decides. Accept with or without door + agent.'}],
  [/relatieve|betrekkelijk|relative/i, {id: 'relative', type: 'fill_in', how: 'Sentences with a gap for die, dat, wie or waar + preposition; the noun it refers to is clear (de/het-word, person/thing).'}],
  [/voorzetsel|preposition/i, {id: 'prepositions', type: 'fill_in', how: 'Fixed combinations (wachten op, denken aan …) or place/time in natural sentences, one gap for the preposition.'}],
  [/reflexie|zich|reflexive/i, {id: 'reflexive', type: 'fill_in', how: 'Sentences with a reflexive verb and a gap for the reflexive pronoun (me, je, zich, ons); the subject is clear.'}],
  [/om … te|om\.\.\. te|te \+ infinitief|infinitive/i, {id: 'om_te', type: 'make_sentence', how: 'Give a goal in a few words; the learner writes one sentence with om … te + infinitive.'}],
];
const GENERIC: Template = {id: 'generic', type: 'fill_in', how: 'Natural everyday sentences that all practise the SAME point; one clear gap per sentence; the context makes the single correct answer unambiguous.'};
/** Words never offered to the AI as "learner words" (slang/vulgar entries in a word bank make odd homework). */
export const AVOID_WORDS = /\b(gezeik|zeiken|kut\w*|klote\w*|shit|fuck\w*|godver\w*|kanker\w*|tering\w*|lul\w*|porra|caralho|merda|puta\w*)\b/i;
export function templateFor(topic: string | null | undefined): Template {
  for (const [re, t] of T) if (re.test(String(topic || ''))) return t;
  return GENERIC;
}

/** Quality rules every block must follow (sent once per block; short). */
export const QUALITY_RULES = [
  'Every item practises the block\'s learning goal in a natural, everyday situation (no random or odd sentences, no random lists of words from the word list).',
  'The expected answer must follow unambiguously from the item; give enough context (time words, subject, situation) for the tense/construction.',
  'Never put the answer (or the requested conjugated form) in the prompt or in brackets; for verbs only the infinitive may be in brackets.',
  'multiple_choice: exactly one correct option, all options plausible and different.',
  'Match the CEFR level: not too easy, not beyond the level.',
  'Open items: list several correct formulations in accept.',
  'Learner words are optional: use one ONLY where it fits the sentence naturally; never force words into a sentence; skip slang, vulgar or very informal words.',
  'The worked example shows the task itself (input → answer) and differs from the items; it is never trivial (input identical to the answer).',
  'Double-check every answer against the sentence (e.g. Dutch inversion: "Morgen werk jij" — no -t after jij/je when the verb comes first).',
];
/** How demanding the language is per level — basic grammar at a high level is practised in richer sentences. */
export function levelStyle(level: string): string {
  const l = String(level || '').toUpperCase();
  return l === 'A0' || l === 'A1' ? 'A1: short simple sentences (5-9 words), high-frequency everyday words, concrete situations.'
    : l === 'A2' ? 'A2: simple sentences with common time/place words and short combinations (en, maar, want), everyday topics.'
    : l === 'B1' ? 'B1: sentences of 10-16 words with subordinate clauses, opinions, plans and experiences, work and society topics.'
    : l === 'B2' ? 'B2: longer complex sentences, several clauses, abstract topics (work, news, society), precise vocabulary; even basic grammar is practised in demanding sentences, never in A1-style sentences.'
    : 'C1+: complex, nuanced sentences, formal and informal register, abstract topics.';
}

/** Programmatic quality check of one item (cheap, before any AI review). Returns a reason or '' when fine. */
export function itemProblem(it: {type: string; prompt: string; options: string[]; answer: string; accept?: string[]}, opts: {open?: boolean} = {}): string {
  const p = String(it.prompt || ''), a = String(it.answer || '').trim(), low = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
  if (p.trim().length < 3 || !a) return 'leeg';
  if (opts.open || it.type === 'write' || it.type === 'reading' || it.type === 'make_sentence') return '';
  const brackets = [...p.matchAll(/\(([^)]{1,80})\)/g)].map(m => low(m[1]));
  if (brackets.some(b => b === low(a) || (a.includes(' ') && b.includes(low(a))))) return 'antwoord staat tussen haakjes';
  if (it.type === 'fill_in' || it.type === 'conjugate') {
    if (!/_{2,}|…/.test(p)) return 'geen invulplek';
    const visible = low(p.replace(/\([^)]*\)/g, '').replace(/_{2,}|…/g, ' '));
    if (a.length > 3 && visible.split(/[^\p{L}']+/u).includes(low(a))) return 'antwoord staat al in de zin';
  }
  if (it.type === 'multiple_choice') {
    const o = it.options.map(low);
    if (new Set(o).size !== o.length) return 'dubbele opties';
    if (o.filter(x => x === low(a)).length !== 1) return 'antwoord niet precies één keer tussen de opties';
  }
  return '';
}
