// v75: intelligent daily challenge — pure part (unit-tested). The AI writes APPLICATION questions for the student's own
// learning-line topics and for the rule behind their own (certain, teacher-kept) mistakes; every question is validated
// here before it is stored or shown. Invalid questions are dropped (only those), never repaired by guessing.
import {z} from 'zod';
import type {Question} from './daily.ts';

export const AI_KINDS = ['mc', 'fill', 'correct', 'order'] as const;
export const GenSchema = z.object({
  questions: z.array(z.object({
    target: z.string().describe('the id of the target this question practises, e.g. "T1" or "E2"'),
    kind: z.enum(AI_KINDS).describe('mc = choose the right form (4 options); fill = type the missing form (one gap "___"); correct = rewrite a wrong sentence correctly; order = put the given words in the right order'),
    prompt: z.string().describe('the exercise sentence in the target language; fill: exactly one "___"; correct: a NEW wrong sentence with the same rule (never the student\'s own sentence); order: the words separated by " / "'),
    instruction: z.string().describe('what exactly is tested, short, in the explanation language (e.g. "Kies het juiste lidwoord + bijvoeglijk naamwoord (vrouwelijk)")'),
    options: z.array(z.string()).describe('mc: exactly 4 different grammatical forms of the same kind, exactly one correct; otherwise empty'),
    answer: z.string().describe('the one correct answer (mc: identical to one option; fill: the missing form; correct/order: the full correct sentence)'),
    accept: z.array(z.string()).describe('other fully correct answers (often empty)'),
    explanation: z.string().describe('1–2 short sentences in the explanation language: the rule + why the answer is right'),
    example: z.string().describe('one extra correct example sentence in the target language with the same rule'),
  })),
});
export type GenQ = z.infer<typeof GenSchema>['questions'][number];
export type BankPayload = {kind: GenQ['kind']; prompt: string; instruction: string; options: string[]; answer: string; accept: string[]; explanation: string; example: string};
export type BankRow = {id: string; topic: string; topic_key: string | null; source: 'topic' | 'error' | 'review'; payload: BankPayload; used_on?: string | null; times_used?: number};

const n = (s: string) => String(s || '').toLowerCase().replace(/[.,!?;:"“”'’¿¡]/g, '').replace(/\s+/g, ' ').trim();
/** Strict quality gate. Returns the reason when invalid (for tests and logging), null when valid. */
export function invalidReason(q: GenQ, ctx: {forbidden?: string[]} = {}): string | null {
  const p = String(q.prompt || '').trim(), a = String(q.answer || '').trim();
  if (!p || !a) return 'empty';
  if (p.length > 260 || a.length > 200) return 'too long';
  if (!String(q.explanation || '').trim()) return 'no explanation';
  if ((ctx.forbidden || []).some(f => n(f) && (n(p) === n(f) || n(p).includes(n(f)) && n(f).split(' ').length >= 4))) return 'repeats the student\'s own sentence';
  if (q.kind === 'mc') {
    const o = (q.options || []).map(x => String(x).trim());
    if (o.length !== 4 || o.some(x => !x)) return 'mc needs 4 options';
    if (new Set(o.map(n)).size !== 4) return 'duplicate options';
    if (o.filter(x => n(x) === n(a)).length !== 1) return 'answer must be exactly one option';
    if ((q.accept || []).some(x => o.some(y => n(y) === n(x) && n(y) !== n(a)))) return 'two correct options';
    if (!/_{2,}|…|\.\.\./.test(p) && o.some(x => n(p).includes(n(x)))) return 'answer visible in prompt';
  } else if ((q.options || []).length) return 'options only for mc';
  if (q.kind === 'fill') { if ((p.match(/_{2,}/g) || []).length !== 1) return 'fill needs one gap'; if (n(p).includes(n(a)) && n(a).length > 2) return 'answer visible in prompt'; }
  if (q.kind === 'correct' && n(p) === n(a)) return 'nothing to correct';
  if (q.kind === 'order') {
    const words = p.split('/').map(x => n(x)).filter(Boolean).join(' ').split(' ').sort().join(' '), want = n(a).split(' ').sort().join(' ');
    if (words !== want) return 'order words do not match the answer';
  }
  return null;
}

/** Deterministic option placement (the correct answer is not always first). */
function placed(options: string[], seed: string) { let h = 2166136261; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } const o = options.slice(); for (let i = o.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [o[i], o[j]] = [o[j], o[i]]; } return o; }
const SUB: Record<BankPayload['kind'], string> = {mc: 'Kies het juiste antwoord', fill: 'Vul de juiste vorm in', correct: 'Verbeter de zin', order: 'Zet de woorden in de goede volgorde'};
/** A stored bank question as a question of the daily set. */
export function toQuestion(r: BankRow, i: number): Question {
  const p = r.payload;
  return {id: 'a' + i, kind: p.kind === 'mc' ? 'mc' : p.kind === 'fill' ? 'fill' : 'correct', source: r.source === 'error' ? 'mistake' : 'grammar', ref: ('gr:tp:' + (r.topic_key || n(r.topic).slice(0, 60))).slice(0, 190), // gr: = allowed practice_items key (v48); per TOPIC, so a wrong answer brings the rule back in a new sentence
    label: r.topic, prompt: p.kind === 'order' ? p.prompt.split('/').map(x => x.trim()).join(' / ') : p.prompt, sub: SUB[p.kind], hint: p.instruction || undefined,
    options: p.kind === 'mc' ? placed(p.options, r.id) : undefined, answers: [p.answer, ...(p.accept || [])], explain: [p.explanation, p.example ? '→ ' + p.example : ''].filter(Boolean).join(' '), bank: r.id};
}

/** Which bank questions to use today: per source the targets in priority order, at most one question per target,
 *  nothing used in the last 3 days. */
export function pickBank(rows: BankRow[], want: {topic: number; error: number; review: number}, today: string): BankRow[] {
  const fresh = rows.filter(r => !r.used_on || (Date.parse(today) - Date.parse(r.used_on)) / 86400e3 >= 3);
  const out: BankRow[] = [], usedTopic = new Set<string>();
  for (const src of ['error', 'topic', 'review'] as const) {
    let k = 0;
    for (const r of fresh.filter(x => x.source === src).sort((a, b) => (a.times_used || 0) - (b.times_used || 0))) {
      if (k >= want[src]) break; const t = (r.topic_key || r.topic) + '|' + src;
      if (usedTopic.has(t) && fresh.filter(x => x.source === src).length > want[src]) continue;
      usedTopic.add(t); out.push(r); k++;
    }
  }
  return out;
}
