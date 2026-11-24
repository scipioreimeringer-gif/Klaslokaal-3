import {authUser, enforceLimit, HttpError, jsonError, uiLanguage} from '../../../../lib/server/ai';
import {studentAccess} from '../../../../lib/server/context';
import {detectCanvasVocab} from '../../../../lib/server/vocab';

export const maxDuration = 60;

/** Teacher: recognise new words on this student's canvas → suggestions to review (nothing goes into the list unseen). */
export async function POST(req: Request) {
  try {
    const {db, user} = await authUser(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const {student, role} = await studentAccess(db, user.id, String(body.studentId || ''));
    if (role !== 'teacher') throw new HttpError(403, 'Alleen de docent kan woorden van het canvas laten herkennen.');
    await enforceLimit(db, user.id, 'vocab');
    const ui = await uiLanguage(db, user.id, body.uiLang);
    const lessonId = typeof body.lessonId === 'string' && /^[0-9a-f-]{36}$/i.test(body.lessonId) ? body.lessonId : null;
    // v62: page = one canvas page (index) or all pages; list = also return the grammar word list of that page
    const page = Number.isInteger(body.page) && (body.page as number) >= 0 && (body.page as number) < 500 ? body.page as number : null;
    try { return Response.json(await detectCanvasVocab(db, student, {userId: user.id, ui, lessonId, page, list: body.list === true && page !== null})); }
    catch (e) { throw new HttpError(400, e instanceof Error ? e.message : String(e)); }
  } catch (e) { return jsonError(e); }
}
