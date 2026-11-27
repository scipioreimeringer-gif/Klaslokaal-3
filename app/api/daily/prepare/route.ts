// v75: prepares the personal part of today's daily challenge — called once when the student presses "Nu beginnen"
// (never because a page is opened). Targets come from the student's own learning line (Extra oefenen → In ontwikkeling →
// topics with recent mistakes → review of mastered topics) and from CERTAIN mistakes the teacher kept in published
// reports. Validated questions are stored and reused; only when the bank lacks questions for today's targets ONE batch
// call is made with compact context (no transcripts, no full word list). Teacher assessments are never changed.
import {authUser, askFast, enforceLimit, HttpError, jsonError, langName} from '../../../../lib/server/ai';
import {studentAccess, subjectCode} from '../../../../lib/server/context';
import {visibleGoals, recommendTopics, topicInfo} from '../../../../lib/curriculum/topics';
import {errorsOf} from '../../../../lib/analysis/core';
import {GenSchema, invalidReason, pickBank, type BankRow, type GenQ} from '../../../../lib/dailyAi';
import {LANG_GUIDE} from '../../../../lib/server/analysisRunner';

export const maxDuration = 60;
const WANT = {topic: 4, error: 2, review: 1};

export async function POST(req: Request) {
  try {
    const {db, user} = await authUser(req);
    const body = await req.json().catch(() => ({})) as {studentId?: string; explain?: string; day?: string};
    const sid = String(body.studentId || '');
    if (!/^[0-9a-f-]{36}$/i.test(sid)) throw new HttpError(400, 'Ongeldige leerling');
    const {student} = await studentAccess(db, user.id, sid);
    const subject = subjectCode(student), level = String(student.level || 'A1').toUpperCase();
    const explain = /^(en|nl|pt|es|fr|de)$/.test(String(body.explain)) ? String(body.explain) : (subject === 'nl' ? 'en' : 'nl');
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(body.day)) ? String(body.day) : new Date().toISOString().slice(0, 10);

    const bankQ = await db.from('practice_questions').select('id,topic,topic_key,source,payload,used_on,times_used,explain_lang').eq('student_id', sid).eq('lang', subject).order('created_at', {ascending: false}).limit(300);
    if (bankQ.error) throw new HttpError(400, /practice_questions/.test(bankQ.error.message) ? 'Voer eerst supabase/v75.sql uit.' : bankQ.error.message);
    let rows = ((bankQ.data || []) as (BankRow & {explain_lang: string | null})[]).filter(r => !r.explain_lang || r.explain_lang === explain);

    /* targets: the learning line (same data as the teacher's) + certain, kept mistakes */
    const [g, p, s] = await Promise.all([
      db.from('curriculum_goals').select('id,level,title,code,sort').eq('subject', subject),
      db.from('student_goal_progress').select('goal_id,status,updated_at,lesson_date,hidden,title_override').eq('student_id', sid),
      db.rpc('student_lesson_summaries', {sid})]);
    const prog = new Map(((p.data || []) as {goal_id: string; status: string; updated_at: string | null; lesson_date: string | null; hidden: boolean | null; title_override: string | null}[]).map(x => [x.goal_id, x]));
    const goals = visibleGoals((g.data || []) as {id: string; level: string; title: string; code: string | null; sort: number}[], subject)
      .map(x => ({...x, status: prog.get(x.id)?.status || 'not_started', updated_at: prog.get(x.id)?.updated_at, lesson_date: prog.get(x.id)?.lesson_date, hidden: !!prog.get(x.id)?.hidden, title: prog.get(x.id)?.title_override || x.title}));
    const errs = ((s.data || []) as {lesson_date: string; final: unknown}[]).flatMap(r => errorsOf(r.final as never)
      .filter(e => e.status !== 'rejected' && !e.later && e.certainty === 'certain' && e.kind === 'error' && e.original && e.corrected).map(e => ({...e, lesson_date: r.lesson_date})))
      .sort((a, b) => (b.repeats || 1) - (a.repeats || 1) || b.lesson_date.localeCompare(a.lesson_date)).slice(0, 8);
    const recs = recommendTopics(goals, {level, errorKeys: new Set(errs.map(e => e.category_key))}, 6);
    const byId = new Map(goals.map(x => [x.id, x]));
    const review = goals.filter(x => x.status === 'mastered' && !x.hidden).sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || '')))[0];

    const fresh = (src: BankRow['source'], key: string) => rows.some(r => r.source === src && (r.topic_key || r.topic) === key && (!r.used_on || (Date.parse(day) - Date.parse(r.used_on)) / 86400e3 >= 3));
    const tTargets = recs.map(r => byId.get(r.id)!).filter(Boolean).filter(x => !fresh('topic', x.code || x.id)).slice(0, WANT.topic);
    const uniqErr = errs.filter((e, i) => errs.findIndex(x => x.category_key === e.category_key) === i);
    const eTargets = uniqErr.filter(e => !fresh('error', e.category_key)).slice(0, WANT.error);
    const rTarget = review && !fresh('review', review.code || review.id) ? review : null;
    const freshCount = (src: BankRow['source']) => pickBank(rows, WANT, day).filter(r => r.source === src).length;
    const need = freshCount('topic') < Math.min(WANT.topic, recs.length) || freshCount('error') < Math.min(WANT.error, uniqErr.length) || (!!review && freshCount('review') < 1);

    let generated = 0, dropped = 0;
    if (need && (tTargets.length || eTargets.length || rTarget)) {
      await enforceLimit(db, user.id, 'exercises');
      const words = ((await db.from('vocab_items').select('term,status,due_at').eq('student_id', sid).order('updated_at', {ascending: false}).limit(40)).data || []) as {term: string; status: string}[];
      const T = tTargets.map((x, i) => ({id: 'T' + (i + 1), level: x.level, topic: x.title, focus: (topicInfo(x.code)?.sub || []).slice(0, 4)}));
      const E = eTargets.map((e, i) => ({id: 'E' + (i + 1), rule: e.category, student_said: e.original, correct: e.corrected, why: e.why || ''}));
      const R = rTarget ? [{id: 'R1', level: rTarget.level, topic: rTarget.title}] : [];
      const target = langName(subject), ex = explain === 'pt' ? 'Brazilian Portuguese' : langName(explain);
      const system = [
        `You write short grammar APPLICATION exercises in ${target} for one learner at CEFR ${level}. ${LANG_GUIDE[subject] || ''}`,
        'For every T target: 2 questions practising that topic. For every E target: 2 questions that apply the SAME RULE in NEW sentences with other words (never repeat or quote the student\'s sentence). For R: 1 review question.',
        `Only grammar and vocabulary suitable for ${level} (never clearly above it). Prefer these known words in sentences when natural: ${words.slice(0, 15).map(w => w.term).join(', ') || '(none)'}.`,
        'Mix kinds (mc, fill, correct, order); from A2 prefer fill/correct/order over mc. mc: exactly 4 forms of the same kind (e.g. o mesmo / a mesma / os mesmos / as mesmas), exactly ONE correct in this context; give enough context (time, person) so only one answer fits.',
        'Sentences must be natural, correct (except the deliberate error in "correct" kind) and unambiguous. Valid informal or regional variants are accepted answers (put them in accept).',
        `instruction and explanation in ${ex}; prompt, options, answer and example in ${target}.`,
      ].join('\n');
      const r = await askFast(GenSchema, system, JSON.stringify({level, T, E, R}), {maxTokens: 7000, log: {db, userId: user.id, kind: 'exercises', studentId: sid}});
      const forbidden = errs.map(e => e.original);
      const ins: Record<string, unknown>[] = [];
      for (const q of r.questions as GenQ[]) {
        const t = T.find(x => x.id === q.target), e = E.find(x => x.id === q.target), rv = R.find(x => x.id === q.target);
        if ((!t && !e && !rv) || invalidReason(q, {forbidden})) { dropped++; continue; }
        const goal = t ? tTargets[T.indexOf(t)] : rv ? rTarget : null, err = e ? eTargets[E.indexOf(e)] : null;
        ins.push({student_id: sid, lang: subject, level, explain_lang: explain, source: err ? 'error' : rv ? 'review' : 'topic',
          topic: err ? err.category : goal!.title, topic_key: err ? err.category_key : (goal!.code || goal!.id), goal_id: goal ? goal.id : null, error_ref: err ? err.id : null,
          payload: {kind: q.kind, prompt: q.prompt.trim(), instruction: q.instruction.trim(), options: q.kind === 'mc' ? q.options.map(o => o.trim()) : [], answer: q.answer.trim(), accept: q.accept.filter(Boolean), explanation: q.explanation.trim(), example: q.example.trim()}});
      }
      if (ins.length) { const w = await db.from('practice_questions').insert(ins).select('id,topic,topic_key,source,payload,used_on,times_used,explain_lang'); if (!w.error) { rows = [...((w.data || []) as typeof rows), ...rows]; generated = ins.length; } }
    }
    const picks = pickBank(rows, WANT, day);
    await Promise.all(picks.map(q => db.from('practice_questions').update({used_on: day, times_used: (q.times_used || 0) + 1}).eq('id', q.id)));
    return Response.json({questions: picks.map(({id, topic, topic_key, source, payload}) => ({id, topic, topic_key, source, payload})), generated, dropped});
  } catch (e) { return jsonError(e); }
}
