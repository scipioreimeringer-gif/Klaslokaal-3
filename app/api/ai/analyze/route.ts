import {authUser, enforceLimit, HttpError, jsonError, uiLanguage} from '../../../../lib/server/ai';
import {studentAccess} from '../../../../lib/server/context';
import {PIPELINE_VERSION} from '../../../../lib/server/analysisRunner';
import {startForRecording, resumeAnalysis, startJob, type Job} from '../../../../lib/server/analysisStart';

// AI lesson analysis 2.0: transcription + chunked analysis run on the server after the response
// (Vercel keeps the function alive via after()). State per step lives in lesson_analyses /
// lesson_analysis_parts, so a failed or interrupted step is resumed instead of redone.
// v56: a successful analysis is published to the student at once (no approval step); the teacher can edit or hide it.
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const {db, user, token} = await authUser(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const ui = await uiLanguage(db, user.id, body.uiLang);
    const job: Job = {db, userId: user.id, ui, token, origin: new URL(req.url).origin};
    if (typeof body.resumeId === 'string') { const r = await resumeAnalysis(job, body.resumeId, body.retryFailed === true); return Response.json(r, {status: r.existing ? 200 : 202}); }
    if (body.test === true || typeof body.transcript === 'string') return await importTestTranscript(job, body);
    const out = await startForRecording(job, String(body.recordingId || ''));
    return Response.json(out, {status: out.existing ? 200 : 202});
  } catch (e) { return jsonError(e); }
}

/** ADMIN-ONLY TEST: an uploaded/pasted transcript goes through the SAME pipeline as a recording
 *  (only the audio → text step is skipped). Stored as is_test (v33): never shared, no homework, no progress. */
async function importTestTranscript(job: Job, body: Record<string, unknown>) {
  const {db, userId} = job;
  const {data: me} = await db.from('profiles').select('role').eq('id', userId).maybeSingle();
  if ((me as {role?: string} | null)?.role !== 'admin') throw new HttpError(403, 'Alleen beheerders mogen testtranscripten importeren.');
  const studentId = String(body.studentId || '');
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) throw new HttpError(400, 'Kies een testleerling.');
  const text = String(body.transcript || '').replace(/\r\n?/g, '\n').trim();
  if (text.length < 40) throw new HttpError(400, 'Het transcript is te kort (minimaal een paar zinnen).');
  if (text.length > 400000) throw new HttpError(400, 'Het transcript is te lang (maximaal 400.000 tekens).');
  const {student, role} = await studentAccess(db, userId, studentId);
  if (role !== 'teacher') throw new HttpError(403, 'Kies een leerling aan wie jij lesgeeft.');
  await enforceLimit(db, userId, 'analysis');
  const ins = await db.from('lesson_analyses').insert({student_id: student.id, lesson_date: new Date().toISOString().slice(0, 10), status: 'processing', created_by: userId, is_test: true, transcript: text, pipeline_version: PIPELINE_VERSION, stage: 'collect'}).select('id').single();
  if (ins.error) throw new HttpError(400, /pipeline_version|stage/.test(ins.error.message) ? 'Voer eerst supabase/v34.sql uit.' : /is_test/.test(ins.error.message) ? 'Voer eerst supabase/v33.sql uit.' : /TEST_ADMIN_ONLY/.test(ins.error.message) ? 'Alleen beheerders mogen testtranscripten importeren.' : ins.error.message);
  startJob(job, ins.data.id as string);
  return Response.json({id: ins.data.id, status: 'processing', test: true}, {status: 202});
}
