// v56: pure rules for AI lesson reports (no server, no database; unit-tested): what the automatic catch-up does with each
// recording, and when a report may be published.
/** Pure decision for the automatic catch-up (unit-tested): what to do with each recording of the teacher. */
export type RecRow = {id: string; ai_consent_teacher_at: string | null; ai_consent_student_at: string | null; created_at: string};
export type AnaRow = {id: string; recording_id: string | null; status: string; updated_at: string | null; is_test?: boolean | null; stage_detail?: Record<string, unknown> | null};
export const MAX_AUTO_RETRIES = 3;
export function catchUpPlan(recs: RecRow[], analyses: AnaRow[], now: number) {
  const byRec = new Map(analyses.filter(a => a.recording_id && !a.is_test).map(a => [a.recording_id!, a]));
  const start: string[] = [], retry: string[] = [], resume: string[] = [], waiting: string[] = [], done: string[] = [], failed: string[] = [], publish: string[] = [];
  for (const r of recs) {
    const a = byRec.get(r.id);
    if (!a) { if (r.ai_consent_teacher_at && r.ai_consent_student_at) start.push(r.id); else waiting.push(r.id); continue; }
    if (a.status === 'approved') { done.push(r.id); continue; }
    // an older report that waited for approval is published now (no approval step any more) — a hidden one stays hidden
    if (a.status === 'ready') { if (a.stage_detail?.hidden) done.push(r.id); else publish.push(a.id); continue; }
    if (a.status === 'failed') { if (Number(a.stage_detail?.auto_retries || 0) < MAX_AUTO_RETRIES) retry.push(a.id); else failed.push(a.id); continue; }
    // processing / queued: only when nothing happened for 10 minutes (an interrupted run) — never two runners
    if (!a.updated_at || now - Date.parse(a.updated_at) > 10 * 60e3) resume.push(a.id);
  }
  return {start, retry, resume, waiting, done, failed, publish};
}
/** A report may only be published when it really says something (never an empty or broken report). */
export function publishable(doc: unknown): boolean {
  const d = doc as {version?: number; report?: {summary?: string} | null; errors?: unknown[]; vocabulary?: unknown[]; summary?: string} | null;
  if (!d || typeof d !== 'object') return false;
  if (d.version === 2) return !!(d.report?.summary && d.report.summary.trim().length >= 20) || (Array.isArray(d.errors) && d.errors.length > 0) || (Array.isArray(d.vocabulary) && d.vocabulary.length > 0);
  return typeof d.summary === 'string' && d.summary.trim().length >= 20;
}
