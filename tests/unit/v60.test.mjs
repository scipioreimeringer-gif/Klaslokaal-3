// v60: AI memory — pure merge rules, recommendations, wiring (reports still published; prep uses the memory).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
import {mergeReport, recommendations} from '../../lib/memory/merge.ts';

const e = (key, extra = {}) => ({original: 'a ' + key, corrected: 'b ' + key, category: key, category_key: key, type: 'grammar', certainty: 'certain', kind: 'error', repeats: 1, status: 'pending', ...extra});

test('same report twice gives the same patterns; a removed error is ignored', () => {
  const doc = {errors: [e('participle'), e('gender', {status: 'rejected'})], covered: []};
  const a = mergeReport([], doc, {analysis_id: 'A', lesson_date: '2026-11-01'});
  assert.deepEqual(a.changed.map(p => p.key), ['participle']);
  const b = mergeReport(a.changed, doc, {analysis_id: 'A', lesson_date: '2026-11-01'});
  assert.equal(b.changed.length, 0, 'already applied report changes nothing');
});

test('recurring → review; recommendations are max three and concrete', () => {
  let pats = [];
  for (const [i, d] of ['2026-11-01', '2026-11-08', '2026-11-15'].entries()) pats = [...pats.filter(p => p.key !== 'participle'), ...mergeReport(pats, {errors: [e('participle')]}, {analysis_id: 'A' + i, lesson_date: d}).changed];
  assert.equal(pats[0].status, 'review'); assert.equal(pats[0].confidence, 'high');
  const r = recommendations(pats);
  assert.ok(r.length >= 1 && r.length <= 3 && /participle/.test(r[0]));
});

test('wiring: memory after every published report, reports still auto-published, prep uses compact memory', () => {
  const run = read('lib/server/analysisRunner.ts');
  assert.match(run, /status: 'approved', draft: doc, final: doc, stage: 'done', error: null, published_at: t/, 'reports are still published automatically');
  assert.match(run, /await applyMemory\(db, student\.id, analysisId, a\.lesson_date, res\.doc\)\.catch\(\(\) => undefined\)/, 'memory update never fails the analysis');
  const r = read('app/api/memory/route.ts');
  assert.match(r, /from\('memory_patterns'\)/); assert.match(r, /report\?\.summary/);
  assert.ok(!/transcript/.test(r.replace(/\/\/.*$/gm, '').replace(/never full transcripts/, '')), 'no transcripts sent to the AI for preparation');
  assert.match(r, /rpc\('memory_propose'/, 'a level change is only a proposal');
  assert.match(read('components/StudentData.tsx'), /\['geheugen','AI-geheugen',Brain\]/);
  assert.match(read('app/api/ai/exercises/route.ts'), /rpc\('memory_focus'/);
  assert.match(read('components/DailyPractice.tsx'), /rpc\('memory_focus'/);
});
