import {after} from 'next/server';
import type {SupabaseClient} from '@supabase/supabase-js';
import {authUser, enforceLimit, HttpError, jsonError, uiLanguage} from '../../../../lib/server/ai';
import {studentAccess} from '../../../../lib/server/context';
import {runAnalysisJob, PIPELINE_VERSION} from '../../../../lib/server/analysisRunner';

// AI lesson analysis 2.0: transcription + chunked analysis run on the server after the response
// (Vercel keeps the function alive via after()). State per step lives in lesson_analyses /
// lesson_analysis_parts, so a failed or interrupted step is resumed instead of redone.
export const maxDuration = 300;

type Job = {db: SupabaseClient; userId: string; ui: string; token: string; origin: string};
const startJob = (j: Job, id: string) => after(() => runAnalysisJob(j.db, id, {userId: j.userId, ui: j.ui, token: j.token, origin: j.origin, started: Date.now()}));

export async function POST(req: Request) {
  try {
    const {db, user, token} = await authUser(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const ui = await uiLanguage(db, user.id, body.uiLang);
    const job: Job = {db, userId: user.id, ui, token, origin: new URL(req.url).origin};
    if (typeof body.resumeId === 'string') return await resume(job, body.resumeId, body.retryFailed === true);
    if (body.test === true || typeof body.transcript === 'string') return await importTestTranscript(job, body);

    const recordingId = String(body.recordingId || '');
    if (!/^[0-9a-f-]{36}$/i.test(recordingId)) throw new HttpError(400, 'Ongeldige opname');
    const r = await db.from('lesson_recordings').select('*').eq('id', recordingId).maybeSingle();
    const rec = r.data as {id: string; student_id: string; created_at: string; lesson_date: string | null; ai_consent_teacher_at: string | null; ai_consent_student_at: string | null; lesson_id?: string | null} | null;
    if (!rec) throw new HttpError(404, 'Opname niet gevonden');
    const {student, role} = await studentAccess(db, user.id, rec.student_id);
    if (role !== 'teacher') throw new HttpError(403, 'Alleen de docent start een analyse');
    if (!rec.ai_consent_teacher_at || !rec.ai_consent_student_at) throw new HttpError(409, !rec.ai_consent_student_at ? 'De leerling heeft nog geen toestemming gegeven voor AI-analyse van deze opname.' : 'Geef eerst zelf toestemming voor AI-analyse van deze opname.');

    // One analysis per recording: reuse the existing row; a finished one is never redone.
    const lessonDate = rec.lesson_date || String(rec.created_at).slice(0, 10);
    const {data: existing} = await db.from('lesson_analyses').select('id,status').eq('recording_id', recordingId).maybeSingle();
    if (existing && existing.status !== 'failed') return Response.json({id: existing.id, status: existing.status, existing: true});
    await enforceLimit(db, user.id, 'analysis');
    let id = existing?.id as string | undefined;
    if (id) await db.from('lesson_analyses').update({status: 'processing', stage: 'collect', error: null, pipeline_version: PIPELINE_VERSION, updated_at: new Date().toISOString()}).eq('id', id);
    else {
      const fields: Record<string, unknown> = {student_id: student.id, recording_id: recordingId, lesson_date: lessonDate, status: 'processing', created_by: user.id, pipeline_version: PIPELINE_VERSION, stage: 'collect'};
      let ins = await db.from('lesson_analyses').insert(rec.lesson_id ? {...fields, lesson_id: rec.lesson_id} : fields).select('id').single();
      if (ins.error && /pipeline_version|stage/.test(ins.error.message)) throw new HttpError(400, 'Voer eerst supabase/v34.sql uit.');
      if (ins.error && rec.lesson_id && /lesson_id/.test(ins.error.message)) { const {lesson_id: _, ...f} = {...fields, lesson_id: null}; ins = await db.from('lesson_analyses').insert(f).select('id').single(); }
      if (ins.error) {
        const again = await db.from('lesson_analyses').select('id,status').eq('recording_id', recordingId).maybeSingle();
        if (again.data) return Response.json({id: again.data.id, status: again.data.status, existing: true});
        throw new HttpError(400, ins.error.message);
      }
      id = ins.data.id as string;
    }
    startJob(job, id);
    return Response.json({id, status: 'processing'}, {status: 202});
  } catch (e) { return jsonError(e); }
}

/** Continue an interrupted analysis or retry failed steps. Successful steps are kept (no double work or counts). */
async function resume(job: Job, id: string, retryFailed: boolean) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Ongeldige analyse');
  const {data} = await job.db.from('lesson_analyses').select('id,student_id,status,is_test').eq('id', id).maybeSingle();
  const a = data as {id: string; student_id: string; status: string; is_test?: boolean} | null;
  if (!a) throw new HttpError(404, 'Analyse niet gevonden');
  const {role} = await studentAccess(job.db, job.userId, a.student_id);
  if (role !== 'teacher') throw new HttpError(403, 'Alleen de docent start een analyse');
  if (a.status === 'approved' || (a.status === 'ready' && a.is_test)) return Response.json({id, status: a.status, existing: true});
  if (retryFailed) await job.db.from('lesson_analysis_parts').delete().eq('analysis_id', id).eq('status', 'failed'); // failed parts get fresh attempts
  await job.db.from('lesson_analyses').update({status: 'processing', error: null, pipeline_version: PIPELINE_VERSION, updated_at: new Date().toISOString()}).eq('id', id);
  startJob(job, id);
  return Response.json({id, status: 'processing'}, {status: 202});
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
