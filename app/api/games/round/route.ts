import {authUser, enforceLimit, HttpError, jsonError, langName, type UsageCtx} from '../../../../lib/server/ai';
import {studentAccess, subjectCode} from '../../../../lib/server/context';
import {tabooFor} from '../../../../lib/server/vocab';
import {pickRound, selectWords, type Selection, type Word} from '../../../../lib/vocab/core';

/** Teacher (host) starts a 30 Seconds / Taboo round. The cards are stored in game_rounds, readable ONLY by the
 *  explaining player (RLS). When the student explains, this response contains no cards at all, so the
 *  teacher's browser never receives them. */
export async function POST(req: Request) {
  try {
    const {db, user} = await authUser(req);
    const b = await req.json().catch(() => ({})) as Record<string, unknown>;
    const {student, role} = await studentAccess(db, user.id, String(b.studentId || ''));
    if (role !== 'teacher') throw new HttpError(403, 'Alleen de docent start een spelronde.');
    const uuid = /^[0-9a-f-]{36}$/i;
    const roundId = String(b.roundId || ''), sessionId = String(b.sessionId || '');
    if (!uuid.test(roundId) || !uuid.test(sessionId)) throw new HttpError(400, 'Ongeldige spelronde');
    const kind = b.kind === 'taboo' ? 'taboo' : 'thirty';
    const explainer = b.explainer === 'student' ? 'student' : 'teacher';
    if (explainer === 'student' && !student.user_id) throw new HttpError(400, 'De leerling heeft nog geen account gekoppeld en kan daarom niet uitleggen.');
    const count = Math.min(5, Math.max(1, Math.round(Number(b.count) || 5)));
    const taboo = Math.min(3, Math.max(1, Math.round(Number(b.taboo) || 3)));
    const roundNo = Math.min(500, Math.max(1, Math.round(Number(b.round) || 1)));
    const sel = (b.selection && typeof b.selection === 'object' ? b.selection : {mode: 'all'}) as Selection;

    const {data, error} = await db.from('vocab_items').select('id,term,translation,example,status,lesson_date,created_at,correct_count,wrong_count,difficult,due_at').eq('student_id', student.id);
    if (error) throw new HttpError(400, /difficult/.test(error.message) ? 'Voer eerst supabase/v35.sql uit.' : error.message);
    const pool = selectWords((data || []) as Word[], sel).filter(w => w.term.trim());
    if (pool.length < count) return Response.json({tooFew: true, available: pool.length});
    const used = await db.rpc('game_used_words', {p_session: sessionId, p_student: student.id});
    if (used.error) throw new HttpError(400, /game_used_words/.test(used.error.message) ? 'Voer eerst supabase/v35.sql uit.' : used.error.message);
    const words = pickRound(pool, count, new Set((used.data || []) as string[]), roundNo * 7919 + Date.now() % 1000);

    let forbidden = new Map<string, string[]>();
    if (kind === 'taboo') {
      await enforceLimit(db, user.id, 'games');
      const log: UsageCtx = {db, userId: user.id, kind: 'games', studentId: student.id};
      forbidden = await tabooFor(db, words.map(w => ({id: w.id, term: w.term})), {level: student.level || 'A1', targetName: langName(subjectCode(student)), log});
    }
    const cards = words.map(w => ({vocab_id: w.id, term: w.term, hint: w.translation, forbidden: kind === 'taboo' ? (forbidden.get(w.id) || []).slice(0, taboo) : []}));
    const explainerId = explainer === 'teacher' ? user.id : student.user_id!;
    // no RETURNING: the teacher may not read a round in which the student explains
    const ins = await db.from('game_rounds').insert({id: roundId, student_id: student.id, session_id: sessionId, round_no: roundNo, kind, explainer_user_id: explainerId, vocab_ids: words.map(w => w.id), cards, created_by: user.id});
    // same round id sent twice (reconnect) → keep the first; another round with the same number → refuse
    if (ins.error && !(ins.error.code === '23505' && /pkey/.test(ins.error.message))) throw new HttpError(ins.error.code === '23505' ? 409 : 400, ins.error.code === '23505' ? 'Deze ronde is al gestart.' : ins.error.message);
    return Response.json({roundId, cardCount: cards.length, ...(explainer === 'teacher' ? {cards} : {})});
  } catch (e) { return jsonError(e); }
}
