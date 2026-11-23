// v56: AI lesson reports are made automatically after a recording and published at once (no approval step);
// existing recordings are caught up; never without consent, never a second or an empty report.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
import {catchUpPlan, publishable, MAX_AUTO_RETRIES} from '../../lib/analysis/catchup.ts';

const NOW = Date.parse('2026-11-23T12:00:00Z');
const R = (id, ai = true) => ({id, ai_consent_teacher_at: ai ? 'x' : null, ai_consent_student_at: ai ? 'y' : null, created_at: '2026-11-22T10:00:00Z'});
const A = (id, rec, status, extra = {}) => ({id, recording_id: rec, status, updated_at: '2026-11-23T11:58:00Z', is_test: false, stage_detail: null, ...extra});

test('catch-up: start, retry, resume, publish — never twice, never without consent', () => {
  const p = catchUpPlan([R('r1'), R('r2', false), R('r3'), R('r4'), R('r5'), R('r6'), R('r7'), R('r8')], [
    A('a3', 'r3', 'approved'), A('a4', 'r4', 'failed'), A('a5', 'r5', 'failed', {stage_detail: {auto_retries: MAX_AUTO_RETRIES}}),
    A('a6', 'r6', 'processing'), A('a7', 'r7', 'processing', {updated_at: '2026-11-23T10:00:00Z'}), A('a8', 'r8', 'ready'), A('t1', 'r1', 'approved', {is_test: true})], NOW);
  assert.deepEqual(p.start, ['r1'], 'a recording with consent and no (non-test) report is started');
  assert.deepEqual(p.waiting, ['r2'], 'no consent → never processed, only counted');
  assert.deepEqual(p.done, ['r3']);
  assert.deepEqual(p.retry, ['a4'], 'failed → retried'); assert.deepEqual(p.failed, ['a5'], '…but at most 3 times');
  assert.deepEqual(p.resume, ['a7'], 'a run without progress for 10 min is resumed; a running one is left alone');
  assert.deepEqual(p.publish, ['a8'], 'a draft that waited for approval is published now');
  assert.deepEqual(catchUpPlan([R('r9')], [A('a9', 'r9', 'ready', {stage_detail: {hidden: true}})], NOW).publish, [], 'a report the teacher hid stays hidden');
});
test('never an empty or broken report', () => {
  assert.equal(publishable(null), false); assert.equal(publishable({version: 2, report: {summary: ''}, errors: [], vocabulary: []}), false);
  assert.equal(publishable({version: 2, report: {summary: 'In deze les oefenden we de verleden tijd met gesprekken.'}}), true);
  assert.equal(publishable({version: 2, report: {summary: ''}, vocabulary: [{term: 'praia'}]}), true);
  assert.match(read('lib/server/analysisRunner.ts'), /if \(!test && !publishable\(doc\)\) \{ await db\.from\('lesson_analyses'\)\.update\(\{status: 'failed'/);
});
test('published at once (no approval); retries are counted and kept; triggered automatically', () => {
  const run = read('lib/server/analysisRunner.ts');
  assert.match(run, /\{status: 'approved', draft: doc, final: doc, stage: 'done', error: null, published_at: t, approved_at: t, updated_at: t\}/);
  assert.match(run, /stage_detail: \{auto_retries: prev\.auto_retries \|\| 0, failed_step: stage\}/);
  assert.match(read('components/Nav.tsx'), /authFetch\(db,'\/api\/ai\/backfill'/, 'the teacher\'s TeachyRooms catches up by itself');
  assert.match(read('lib/classroomBridge.ts'), /await postJson\(db, '\/api\/ai\/analyze', \{recordingId: row\.data\.id\}\)/, 'started right after the upload');
  const b = read('app/api/ai/backfill/route.ts'); assert.match(b, /const PER_CALL = 2;/); assert.match(b, /\.eq\('id', id\)\.eq\('status', 'ready'\)/, 'publishing never overwrites');
  assert.ok(!/export (async )?function (startForRecording|resume)/.test(read('app/api/ai/analyze/route.ts')), 'route file only exports POST/maxDuration');
});
test('consent: asked by default, an active choice for the student, possible afterwards; never assumed', () => {
  const h = read('public/legacy/index.html');
  assert.match(h, /<input type="checkbox" id="recAiT" checked>/);
  assert.match(h, /id="recYesPlain" type="button" hidden>Alleen opnemen, zonder AI-verslag/);
  assert.match(h, /cfg = store\(key\) \|\| \{on:false, ai:true\}/);
  const m = read('supabase/v56.sql');
  assert.match(m, /if public\.is_linked_student\(r\.student_id\) then\s+update public\.lesson_recordings set ai_consent_student_at/);
  assert.ok(!/drop |delete from|alter table/i.test(m.replace(/--.*$/gm, '')), 'v56 changes no table and deletes nothing');
  assert.match(read('components/LessonCards.tsx'), /rpc\('give_ai_consent',\{p_recording:rec\.recording_id\}\)/);
});
test('student sees the state and the report without reloading; teacher can edit and hide', () => {
  const lc = read('components/LessonCards.tsx');
  assert.match(lc, /if\(list\.some\(s=>PENDING\.has\(s\.state\)\)\)timer=setTimeout\(\(\)=>void poll\(\),20000\)/);
  assert.match(lc, /Van deze les is geen opname bewaard, daarom is er geen AI-verslag\. Een verslag wordt nooit verzonnen zonder opname\./);
  const a = read('components/AnalysisV2.tsx');
  assert.match(a, /status:'ready',stage_detail:sd/); assert.match(a, /\{tt\('Verbergen voor de leerling'\)\}/);
  assert.match(read('supabase/v56.sql'), /student_analysis_status[\s\S]*when coalesce\(\(a\.stage_detail->>'hidden'\)::boolean, false\) then 'hidden'/);
});
