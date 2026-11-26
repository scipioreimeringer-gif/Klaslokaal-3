import 'server-only';
// v56: starting AI lesson analyses — shared by /api/ai/analyze (after an upload, retry) and /api/ai/backfill (automatic
// catch-up of existing recordings). One analysis per recording; a finished or running one is never started twice.
// Consent of teacher AND student stays required (also enforced by the database trigger check_analysis_consent).
import {after} from 'next/server';
import type {SupabaseClient} from '@supabase/supabase-js';
import {enforceLimit, HttpError} from './ai';
import {studentAccess} from './context';
import {runAnalysisJob, PIPELINE_VERSION} from './analysisRunner';

export type Job = {db: SupabaseClient; userId: string; ui: string; token: string; origin: string};
export const startJob = (j: Job, id: string) => after(() => runAnalysisJob(j.db, id, {userId: j.userId, ui: j.ui, token: j.token, origin: j.origin, started: Date.now()}));
export type StartResult = {id: string; status: string; existing?: boolean};

export async function startForRecording(job: Job, recordingId: string): Promise<StartResult> {
  const {db, userId} = job;
  if (!/^[0-9a-f-]{36}$/i.test(recordingId)) throw new HttpError(400, 'Ongeldige opname');
  const r = await db.from('lesson_recordings').select('*').eq('id', recordingId).maybeSingle();
  const rec = r.data as {id: string; student_id: string; created_at: string; lesson_date: string | null; ai_consent_teacher_at: string | null; ai_consent_student_at: string | null; lesson_id?: string | null} | null;
  if (!rec) throw new HttpError(404, 'Opname niet gevonden');
  const {student, role} = await studentAccess(db, userId, rec.student_id);
  if (role !== 'teacher') throw new HttpError(403, 'Alleen de docent start een analyse');
  if (!rec.ai_consent_teacher_at || !rec.ai_consent_student_at) throw new HttpError(409, !rec.ai_consent_student_at ? 'De leerling heeft nog geen toestemming gegeven voor AI-analyse van deze opname.' : 'Geef eerst zelf toestemming voor AI-analyse van deze opname.');

  const lessonDate = rec.lesson_date || String(rec.created_at).slice(0, 10);
  const {data: existing} = await db.from('lesson_analyses').select('id,status').eq('recording_id', recordingId).maybeSingle();
  if (existing && existing.status !== 'failed') return {id: existing.id, status: existing.status, existing: true};
  await enforceLimit(db, userId, 'analysis');
  let id = existing?.id as string | undefined;
  if (id) await db.from('lesson_analyses').update({status: 'processing', stage: 'collect', error: null, pipeline_version: PIPELINE_VERSION, updated_at: new Date().toISOString()}).eq('id', id);
  else {
    const fields: Record<string, unknown> = {student_id: student.id, recording_id: recordingId, lesson_date: lessonDate, status: 'processing', created_by: userId, pipeline_version: PIPELINE_VERSION, stage: 'collect'};
    let ins = await db.from('lesson_analyses').insert(rec.lesson_id ? {...fields, lesson_id: rec.lesson_id} : fields).select('id').single();
    if (ins.error && /pipeline_version|stage/.test(ins.error.message)) throw new HttpError(400, 'Voer eerst supabase/v34.sql uit.');
    if (ins.error && rec.lesson_id && /lesson_id/.test(ins.error.message)) { const {lesson_id: _, ...f} = {...fields, lesson_id: null}; ins = await db.from('lesson_analyses').insert(f).select('id').single(); }
    if (ins.error) {
      const again = await db.from('lesson_analyses').select('id,status').eq('recording_id', recordingId).maybeSingle();
      if (again.data) return {id: again.data.id, status: again.data.status, existing: true};
      throw new HttpError(400, ins.error.message);
    }
    id = ins.data.id as string;
  }
  startJob(job, id);
  return {id, status: 'processing'};
}

/** Continue an interrupted analysis or retry failed steps. Successful steps are kept (no double work or counts). */
export async function resumeAnalysis(job: Job, id: string, retryFailed: boolean): Promise<StartResult> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Ongeldige analyse');
  const {data} = await job.db.from('lesson_analyses').select('id,student_id,status,is_test,stage,stage_detail').eq('id', id).maybeSingle();
  const a = data as {id: string; student_id: string; status: string; is_test?: boolean; stage?: string | null; stage_detail?: {rerun?: boolean} | null} | null;
  if (!a) throw new HttpError(404, 'Analyse niet gevonden');
  const {role} = await studentAccess(job.db, job.userId, a.student_id);
  if (role !== 'teacher') throw new HttpError(403, 'Alleen de docent start een analyse');
  const rerun = !!a.stage_detail?.rerun && a.stage !== 'done'; // v72: a running re-analysis continues; the old report stays visible
  if (!rerun && (a.status === 'approved' || a.status === 'ready')) return {id, status: a.status, existing: true};
  if (retryFailed) await job.db.from('lesson_analysis_parts').delete().eq('analysis_id', id).eq('status', 'failed'); // failed parts get fresh attempts
  await job.db.from('lesson_analyses').update(rerun ? {error: null, updated_at: new Date().toISOString()} : {status: 'processing', error: null, pipeline_version: PIPELINE_VERSION, updated_at: new Date().toISOString()}).eq('id', id);
  startJob(job, id);
  return {id, status: 'processing'};
}

export {catchUpPlan, publishable, MAX_AUTO_RETRIES, type RecRow, type AnaRow} from '../analysis/catchup';

/** v72: "AI-analyse opnieuw uitvoeren" for an existing report — by default with the stored transcript; optionally
 *  re-transcribed from the original recording, or with an imported transcript / imported audio. The recording and the
 *  current report are kept until the new analysis has succeeded; the teacher's error decisions are carried over.
 *  Never runs automatically over the lesson history: one report per explicit request. */
export async function rerunAnalysis(job: Job, id: string, o: {retranscribe?: boolean; transcript?: string; audio?: {paths: string[]; offsets: number[]; mime: string}}): Promise<StartResult> {
  const {db, userId} = job;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Ongeldige analyse');
  const {data} = await db.from('lesson_analyses').select('id,student_id,status,stage,stage_detail,recording_id,transcript,updated_at').eq('id', id).maybeSingle();
  const a = data as {id: string; student_id: string; status: string; stage: string | null; stage_detail: Record<string, unknown> | null; recording_id: string | null; transcript: string | null; updated_at: string | null} | null;
  if (!a) throw new HttpError(404, 'Analyse niet gevonden');
  const {role} = await studentAccess(db, userId, a.student_id);
  if (role !== 'teacher') throw new HttpError(403, 'Alleen de docent start een analyse');
  if (a.status !== 'approved' && a.status !== 'ready') throw new HttpError(409, 'Alleen een afgerond verslag kan opnieuw worden geanalyseerd. Gebruik bij een mislukte analyse "Opnieuw proberen".');
  const busy = !!a.stage_detail?.rerun && a.stage !== 'done' && a.stage !== 'failed' && a.stage !== 'partial_failed' && !!a.updated_at && Date.now() - new Date(a.updated_at).getTime() < 6 * 60_000;
  if (busy) return {id, status: 'processing', existing: true};
  const text = typeof o.transcript === 'string' ? o.transcript.replace(/\r\n?/g, '\n').trim() : '';
  if (o.transcript !== undefined && text.length < 40) throw new HttpError(400, 'Het transcript is te kort (minimaal een paar zinnen).');
  if (text.length > 400000) throw new HttpError(400, 'Het transcript is te lang (maximaal 400.000 tekens).');
  const audio = o.audio && Array.isArray(o.audio.paths) && o.audio.paths.length && o.audio.paths.length <= 30 && o.audio.paths.every(p => typeof p === 'string' && p.startsWith(a.student_id + '/import-')) ? o.audio : undefined;
  if (o.audio && !audio) throw new HttpError(400, 'Ongeldige audio-upload.');
  if (o.retranscribe && !a.recording_id) throw new HttpError(400, 'Bij dit verslag hoort geen opname om opnieuw te transcriberen.');
  if (!text && !audio && !o.retranscribe && !a.transcript) throw new HttpError(400, 'Er is geen transcript; kies "Opnieuw transcriberen" of importeer een transcript.');
  await enforceLimit(db, userId, 'analysis');
  await db.from('lesson_analysis_parts').delete().eq('analysis_id', id);
  const sd = a.stage_detail || {};
  const up = await db.from('lesson_analyses').update({stage: 'collect', error: null, pipeline_version: PIPELINE_VERSION, updated_at: new Date().toISOString(),
    stage_detail: {hidden: sd.hidden, rerun: true, run: Date.now().toString(36), retranscribe: !!o.retranscribe && !text && !audio, ...(text ? {pending_transcript: text} : {}), ...(audio ? {import_audio: {paths: audio.paths, offsets: audio.offsets.map(n => Math.max(0, Number(n) || 0)), mime: String(audio.mime || 'audio/mpeg').slice(0, 40)}} : {})}}).eq('id', id);
  if (up.error) throw new HttpError(400, up.error.message);
  startJob(job, id);
  return {id, status: 'processing'};
}