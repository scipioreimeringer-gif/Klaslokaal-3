// v46 phase 3: daily practice — own material only, spaced repetition, variety, level, checking, streak, summary.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildDaily, checkAnswer, streakOf, summaryOf, gapOf, priority} from '../../lib/daily.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const NOW = Date.parse('2026-11-21T09:00:00Z');
const W = (n, extra = {}) => ({id: 'w' + n, term: ['de fiets', 'lopen', 'gezellig', 'het brood', 'omdat', 'de afspraak', 'morgen', 'vaak'][n % 8], translation: ['bike', 'to walk', 'cosy', 'bread', 'because', 'appointment', 'tomorrow', 'often'][n % 8],
  example: n % 8 === 0 ? 'Ik ga met de fiets naar school.' : '', pos: '', status: 'new', due_at: '2026-11-20T00:00:00Z', wrong_count: 0, streak: 0, last_practiced_at: null, ...extra});
const M = (n, extra = {}) => ({key: 'err:a1:e' + n, original: 'Gisteren ik ben naar huis gegaan', corrected: 'Gisteren ben ik naar huis gegaan', why: 'Werkwoord op plek 2.', type: 'word_order', label: 'Inversie', repeats: 1, lesson_date: '2026-11-19', ...extra});
const base = {studentId: 's1', day: '2026-11-21', level: 'A2', words: Array.from({length: 8}, (_, i) => W(i)), mistakes: [M(1), M(2, {original: 'Ik heb naar huis gegaan', corrected: 'Ik ben naar huis gegaan', label: 'Hebben/zijn', type: 'conjugation'})], homework: [], state: [], now: NOW};

test('no material yet → clear empty state, no invented questions', () => {
  const s = buildDaily({...base, words: [], mistakes: [], homework: []});
  assert.equal(s.empty, true); assert.equal(s.questions.length, 0);
});
test('only own material: every question points to one of the given words, mistakes or homework items', () => {
  const s = buildDaily({...base, homework: [{key: 'hw:x:0', type: 'multiple_choice', prompt: 'Kies', options: ['a', 'b'], answer: 'a', accept: [], explanation: '', label: 'Huiswerk'}]});
  const refs = new Set([...base.words.map(w => w.id), ...base.mistakes.map(m => m.key), 'hw:x:0']);
  assert.ok(s.questions.length >= 5 && s.questions.length <= 10);
  assert.ok(s.questions.every(q => refs.has(q.ref)));
  assert.ok(s.questions.every(q => q.answers.every(a => a && typeof a === 'string')));
  assert.ok(s.minutes >= 1 && s.minutes <= 12, '±5–10 minutes');
});
test('the same set after a refresh, a different mix on another day', () => {
  const a = buildDaily(base), b = buildDaily(base), c = buildDaily({...base, day: '2026-11-22'});
  assert.deepEqual(a.questions.map(q => q.id + q.ref), b.questions.map(q => q.id + q.ref));
  assert.notDeepEqual(a.questions.map(q => q.kind + q.ref), c.questions.map(q => q.kind + q.ref));
});
test('spaced repetition: due, difficult and repeated items first; just-practised items wait', () => {
  assert.ok(priority({due_at: '2026-11-20T00:00:00Z', wrong_count: 2, difficult: true, streak: 0}, NOW) > priority({due_at: '2026-11-30T00:00:00Z', wrong_count: 0, streak: 3, last: '2026-11-21T08:00:00Z'}, NOW));
  const words = [W(0, {due_at: '2026-12-30T00:00:00Z', streak: 4, last_practiced_at: '2026-11-21T08:30:00Z'}), ...Array.from({length: 7}, (_, i) => W(i + 1, {difficult: i === 0, wrong_count: i === 0 ? 3 : 0}))];
  const s = buildDaily({...base, words, mistakes: [], max: 4});
  assert.ok(!s.questions.some(q => q.ref === 'w0'), 'mastered and practised an hour ago → not today');
  assert.ok(s.questions.some(q => q.ref === 'w1'), 'the difficult word comes back');
});
test('variety: several exercise types; A0/A1 no free writing; mistakes become correct/choose/fill/speak tasks', () => {
  const kinds = new Set(); for (let d = 1; d <= 14; d++) buildDaily({...base, day: `2026-11-${String(d).padStart(2, '0')}`, level: 'B1'}).questions.forEach(q => kinds.add(q.kind));
  for (const k of ['mc', 'fill', 'correct']) assert.ok(kinds.has(k), k); // v51: from A2 words are practised in context, rarely as bare flashcards
  const a1 = new Set(); for (let d = 1; d <= 14; d++) buildDaily({...base, day: `2026-11-${String(d).padStart(2, '0')}`, level: 'A1'}).questions.forEach(q => a1.add(q.kind));
  for (const k of ['mc', 'flash']) assert.ok(a1.has(k), 'A1 ' + k);
  for (let d = 1; d <= 14; d++) assert.ok(!buildDaily({...base, day: `2026-11-${String(d).padStart(2, '0')}`, level: 'A1'}).questions.some(q => q.kind === 'write'));
  const mq = buildDaily(base).questions.filter(q => q.source === 'mistake');
  assert.ok(mq.every(q => q.answers[0].length > 0 && ['correct', 'mc', 'fill', 'speak'].includes(q.kind)));
});
test('checking: punctuation/capitals do not matter for sentences; accents = almost right; gap = the corrected word', () => {
  const q = {kind: 'correct', answers: ['Gisteren ben ik naar huis gegaan.']};
  assert.equal(checkAnswer(q, 'gisteren ben ik naar huis gegaan'), 'correct');
  assert.equal(checkAnswer(q, 'Gisteren ik ben naar huis gegaan'), 'wrong');
  assert.equal(checkAnswer({kind: 'fill', answers: ['está']}, 'esta'), 'accent');
  assert.deepEqual(gapOf('Ik heb naar huis gegaan', 'Ik ben naar huis gegaan'), {before: 'Ik', gap: 'ben', after: 'naar huis gegaan'});
  assert.equal(gapOf('a b c d e', 'v w x y z'), null, 'whole sentence different → no fill-in');
});
test('streak: consecutive days up to today (or yesterday when today is not done yet)', () => {
  assert.equal(streakOf(['2026-11-19', '2026-11-20', '2026-11-21'], '2026-11-21'), 3);
  assert.equal(streakOf(['2026-11-19', '2026-11-20'], '2026-11-21'), 2);
  assert.equal(streakOf(['2026-11-18', '2026-11-20'], '2026-11-21'), 1);
  assert.equal(streakOf([], '2026-11-21'), 0);
});
test('summary: correct/wrong, words and grammar that need attention', () => {
  const s = summaryOf([{q: {source: 'word', kind: 'mc', prompt: 'lopen', answers: ['to walk'], label: ''}, ok: false}, {q: {source: 'mistake', kind: 'correct', prompt: 'x', answers: ['y'], label: 'Inversie'}, ok: false}, {q: {source: 'word', kind: 'flash', prompt: 'x', answers: ['z'], label: ''}, ok: true}]);
  assert.deepEqual(s, {correct: 1, wrong: 2, words: ['lopen'], grammar: ['Inversie']});
});
test('wiring: own data via RLS, only APPROVED mistakes, results stored, one AI call only for free sentences', () => {
  const c = read('components/DailyPractice.tsx');
  assert.match(c, /errorsOf\(r\.final as never\)\.filter\(e => e\.status === 'approved' && !e\.later/);
  assert.match(c, /db\.rpc\('record_vocab_practice', \{item: qq\.ref, correct: ok\}\)/);
  assert.match(c, /db\.rpc\('record_practice_item', \{p_student: studentId, p_key: qq\.ref/);
  assert.match(c, /kind: 'daily', score: s\.correct, total: s\.correct \+ s\.wrong/);
  assert.equal((c.match(/authedPost/g) || []).length, 2, 'import + the one feedback call');
  assert.match(c, /if \(!d\.hasMaterial\) return <div className="lc-empty">/);
  assert.match(c, /Spraakherkenning is in deze browser niet beschikbaar: typ je antwoord\./, 'alternative without microphone');
  const r = read('app/api/practice/check/route.ts');
  assert.match(r, /await enforceLimit\(db, user\.id, 'exercises'\);/); assert.match(r, /never comment on pronunciation/);
  assert.match(read('app/page.tsx'), /<DailyCard key=\{s\.id\} studentId=\{s\.id\}/);
  assert.match(read('components/StudentData.tsx'), /<TeacherDailyOverview studentId=\{studentId\}\/>/);
});
