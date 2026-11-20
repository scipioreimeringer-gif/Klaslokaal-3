// v46 phase 3: short feedback on a sentence the student wrote or spoke in the daily practice. The ONLY AI call of the
// daily practice; only after the student submits, with the existing fair-use limit. Grammar and word use only — no
// pronunciation (a transcript cannot show that reliably).
import {z} from 'zod';
import {askFast, authUser, enforceLimit, HttpError, jsonError, langName, uiLanguage} from '../../../../lib/server/ai';
import {studentAccess, subjectCode} from '../../../../lib/server/context';

export const maxDuration = 30;
const Result = z.object({
  ok: z.boolean().describe('true when the sentence is correct and natural for the level (small style choices are fine)'),
  corrected: z.string().describe('the sentence minimally corrected; identical when ok'),
  feedback: z.string().describe('max 25 words, friendly, in the feedback language; mention the main issue or what was good'),
  uses_word: z.boolean().describe('whether the sentence really uses the required word or expression (any correct form)'),
});

export async function POST(req: Request) {
  try {
    const {db, user} = await authUser(req);
    const b = await req.json().catch(() => ({})) as {studentId?: string; word?: string; sentence?: string; uiLang?: string};
    const {student} = await studentAccess(db, user.id, String(b.studentId || ''));
    const sentence = String(b.sentence || '').trim().slice(0, 300), word = String(b.word || '').trim().slice(0, 120);
    if (sentence.length < 2) throw new HttpError(400, 'Schrijf eerst een zin');
    await enforceLimit(db, user.id, 'exercises');
    const ui = await uiLanguage(db, user.id, b.uiLang);
    const target = langName(subjectCode(student));
    const r = await askFast(Result, [
      `You check one short ${target} sentence of a language learner (level ${student.level || 'A1'}).`,
      `Required word or expression: "${word || '(none)'}". Judge grammar and word use only, at the learner's level; never comment on pronunciation or spelling of names.`,
      `Correct, natural informal language is fine. Feedback language: ${langName(ui)}.`,
    ].join('\n'), JSON.stringify({sentence}), {maxTokens: 400, effort: 'low', log: {db, userId: user.id, kind: 'exercises', studentId: student.id}});
    return Response.json({ok: r.ok && r.uses_word, corrected: r.corrected.slice(0, 300), feedback: r.feedback.slice(0, 300), usesWord: r.uses_word});
  } catch (e) { return jsonError(e); }
}
