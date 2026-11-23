// v56: automatic catch-up of AI lesson reports, run with the teacher's own session (RLS: only own students).
// Called quietly when the teacher opens TeachyRooms (dashboard, lessons). For every recording of the teacher's
// students: consent of both + no report → start; failed → retry (max 3, with the reason kept); interrupted → resume.
// Recordings without AI consent are only counted (never processed: consent cannot be assumed). At most a few
// analyses start per call (time and cost); the rest follows on the next visit. Never a second report per recording.
import {authUser, jsonError, uiLanguage} from '../../../../lib/server/ai';
import {catchUpPlan, publishable, startForRecording, resumeAnalysis, MAX_AUTO_RETRIES, type Job, type RecRow, type AnaRow} from '../../../../lib/server/analysisStart';

export const maxDuration = 300;
const PER_CALL = 2;

export async function POST(req: Request) {
  try {
    const {db, user, token} = await authUser(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const {data: isTeacher} = await db.rpc('is_teacher');
    if (!isTeacher) return Response.json({skipped: true});
    const ui = await uiLanguage(db, user.id, body.uiLang);
    const job: Job = {db, userId: user.id, ui, token, origin: new URL(req.url).origin};
    const {data: mine} = await db.from('students').select('id').eq('teacher_id', user.id);
    const ids = ((mine || []) as {id: string}[]).map(s => s.id);
    if (!ids.length) return Response.json({started: 0, retried: 0, resumed: 0, waiting: 0, failed: 0, done: 0});
    const r = await db.from('lesson_recordings').select('id,ai_consent_teacher_at,ai_consent_student_at,created_at').in('student_id', ids).order('created_at', {ascending: false}).limit(200);
    if (r.error) return Response.json({error: r.error.message}, {status: 500});
    const recs = (r.data || []) as RecRow[];
    const a = recs.length ? await db.from('lesson_analyses').select('id,recording_id,status,updated_at,is_test,stage_detail').in('recording_id', recs.map(x => x.id)) : {data: []};
    const plan = catchUpPlan(recs, (a.data || []) as AnaRow[], Date.now());
    let budget = PER_CALL; const out = {started: 0, retried: 0, resumed: 0, published: 0, errors: [] as string[]};
    // drafts that waited for approval: publish them now when they have real content (no AI call)
    for (const id of plan.publish) {
      const {data: d} = await db.from('lesson_analyses').select('draft,final').eq('id', id).maybeSingle();
      const doc = (d as {draft?: unknown; final?: unknown} | null)?.final || (d as {draft?: unknown} | null)?.draft;
      if (!publishable(doc)) continue;
      const t = new Date().toISOString();
      const u = await db.from('lesson_analyses').update({status: 'approved', final: doc, published_at: t, approved_at: t, updated_at: t}).eq('id', id).eq('status', 'ready');
      if (!u.error) out.published++;
    }
    for (const id of plan.resume) { if (budget <= 0) break; try { await resumeAnalysis(job, id, false); out.resumed++; budget--; } catch (e) { out.errors.push(String((e as Error).message)); } }
    for (const id of plan.retry) {
      if (budget <= 0) break;
      const row = ((a.data || []) as AnaRow[]).find(x => x.id === id); const n = Number(row?.stage_detail?.auto_retries || 0) + 1;
      await db.from('lesson_analyses').update({stage_detail: {...(row?.stage_detail || {}), auto_retries: n, last_error_before_retry: null}}).eq('id', id);
      try { await resumeAnalysis(job, id, true); out.retried++; budget--; } catch (e) { out.errors.push(String((e as Error).message)); }
    }
    for (const id of plan.start) { if (budget <= 0) break; try { await startForRecording(job, id); out.started++; budget--; } catch (e) { out.errors.push(String((e as Error).message)); } }
    return Response.json({...out, waiting: plan.waiting.length, failed: plan.failed.length, done: plan.done.length, pending: plan.start.length + plan.retry.length + plan.resume.length - out.started - out.retried - out.resumed, maxRetries: MAX_AUTO_RETRIES});
  } catch (e) { return jsonError(e); }
}
