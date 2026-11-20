// v46 phase 3: short feedback on a sentence the student wrote or spoke in the daily practice. The ONLY AI call of the
// daily practice; only after the student submits, with the existing fair-use limit. Grammar and word use only — no
// pronunciation (a transcript cannot show that reliably).
import {z} from 'zod';
import {askFast, authUser, enforceLimit, HttpError, jsonError, langName, uiLanguage} from '../../../../lib/server/ai';
import {studentAccess, subjectCode} from '../../../../lib/server/context';

export const maxDuration = 30;
const GRAMMAR: Record<string, string> = {past_tense: 'a past tense', auxiliary: 'the perfect tense with the right auxiliary', present_tense: 'the present tense', ser_estar: 'ser or estar correctly', inversion: 'inversion (verb in second place)', subordinate_clause: 'a subordinate clause with correct word order', conjugation: 'correctly conjugated verbs'};
const Result = z.object({
  ok: z.boolean().describe('true when the sentence is correct and natural for the level (small style choices are fine)'),
  corrected: z.string().describe('the sentence minimally corrected; identical when ok'),
  feedback: z.string().describe('max 25 words, friendly, in the feedback language; mention the main issue or what was good'),
  uses_word: z.boolean().describe('whether the sentence really uses the required word or expression (any correct form)'),
});

export async function POST(req: Request) {
  try {
    const {db, user} = await authUser(req);
    const b = await req.json().catch(() => ({})) as {studentId?: string; word?: string; question?: string; grammar?: string; sentence?: string; uiLang?: string};
    const {student} = await studentAccess(db, user.id, String(b.studentId || ''));
    const sentence = String(b.sentence || '').trim().slice(0, 300), word = String(b.word || '').trim().slice(0, 120);
    // v51: an answer to a conversation question, and the grammar the sentence should show (e.g. a past tense)
    const question = String(b.question || '').trim().slice(0, 200), grammar = GRAMMAR[String(b.grammar || '')] || '';
    if (sentence.length < 2) throw new HttpError(400, 'Schrijf eerst een zin');
    await enforceLimit(db, user.id, 'exercises');
    const ui = await uiLanguage(db, user.id, b.uiLang);
    const target = langName(subjectCode(student));
    const r = await askFast(Result, [
      `You check one short ${target} sentence of a language learner (level ${student.level || 'A1'}).`,
      question ? `The learner answers this question: "${question}". ok = a correct, natural answer that really answers the question (a short complete sentence).` : `Required word or expression: "${word || '(none)'}".`,
      grammar ? `The sentence should use: ${grammar}. When it does not, ok = false and say so briefly.` : '',
      'Judge grammar and word use only, at the learner\'s level; never comment on pronunciation or spelling of names.',
      `Correct, natural informal language is fine. Feedback language: ${langName(ui)}.`,
    ].join('\n'), JSON.stringify({sentence}), {maxTokens: 400, effort: 'low', log: {db, userId: user.id, kind: 'exercises', studentId: student.id}});
    return Response.json({ok: r.ok && (question ? true : r.uses_word), corrected: r.corrected.slice(0, 300), feedback: r.feedback.slice(0, 300), usesWord: r.uses_word});
  } catch (e) { return jsonError(e); }
}
