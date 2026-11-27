// v75: intelligent daily challenge (validated personal bank questions, 4/3/2/1 mix) and the new student dashboard.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {invalidReason, toQuestion, pickBank} from '../../lib/dailyAi.ts';
import {buildDaily} from '../../lib/daily.ts';
import {levelOf, XP_PER_LEVEL} from '../../lib/motivation.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');

const mc = (o = {}) => ({target: 'E1', kind: 'mc', prompt: 'Os dois quartos têm ___ tamanho.', instruction: 'Kies de juiste vorm (mannelijk enkelvoud)', options: ['a mesma', 'o mesmo', 'as mesmas', 'os mesmos'], answer: 'o mesmo', accept: [], explanation: '"Tamanho" is mannelijk: o mesmo.', example: 'Nós temos o mesmo carro.', ...o});

test('quality gate: exactly 4 unique options with ONE correct answer, real gaps, never the student\'s own sentence', () => {
  assert.equal(invalidReason(mc()), null);
  assert.equal(invalidReason(mc({options: ['a mesma', 'o mesmo', 'o mesmo', 'os mesmos']})), 'duplicate options');
  assert.equal(invalidReason(mc({options: ['a mesma', 'o mesmo', 'as mesmas']})), 'mc needs 4 options');
  assert.equal(invalidReason(mc({answer: 'o mesma'})), 'answer must be exactly one option');
  assert.equal(invalidReason(mc({accept: ['a mesma']})), 'two correct options');
  assert.equal(invalidReason(mc({explanation: ' '})), 'no explanation');
  assert.equal(invalidReason({...mc(), kind: 'fill', options: [], prompt: 'Nós temos ___ opinião.', answer: 'a mesma'}), null);
  assert.equal(invalidReason({...mc(), kind: 'fill', options: [], prompt: 'Nós temos a mesma opinião.', answer: 'a mesma'}), 'fill needs one gap');
  assert.equal(invalidReason({...mc(), kind: 'correct', options: [], prompt: 'É a mesma tamanho.', answer: 'É o mesmo tamanho.'}, {forbidden: ['É a mesma tamanho.']}), 'repeats the student\'s own sentence');
  assert.equal(invalidReason({...mc(), kind: 'correct', options: [], prompt: 'Eles têm a mesmo problema.', answer: 'Eles têm o mesmo problema.'}, {forbidden: ['É a mesma tamanho.']}), null, 'same rule, new sentence');
  assert.equal(invalidReason({...mc(), kind: 'order', options: [], prompt: 'ik / gisteren / ben / gegaan / naar huis', answer: 'Gisteren ben ik naar huis gegaan'}), null);
  assert.equal(invalidReason({...mc(), kind: 'order', options: [], prompt: 'ik / gisteren / ben', answer: 'Gisteren ben ik naar huis gegaan'}), 'order words do not match the answer');
  assert.equal(invalidReason({...mc(), kind: 'fill', prompt: 'Nós temos ___ opinião.', answer: 'a mesma'}), 'options only for mc');
});

test('bank question → daily question: answer position varies, spaced repetition per TOPIC with an allowed key', () => {
  const qs = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => toQuestion({id, topic: 'Geslacht en overeenkomst', topic_key: 'gender', source: 'error', payload: {...mc(), kind: 'mc'}}, i));
  assert.ok(qs.every(q => q.options.length === 4 && q.answers[0] === 'o mesmo' && q.ref === 'gr:tp:gender' && q.source === 'mistake'));
  assert.ok(new Set(qs.map(q => q.options.indexOf('o mesmo'))).size > 1, 'the correct answer is not always in the same place');
  assert.match(read('supabase/v48.sql'), /item_key ~ '\^\(err\|hw\|gr\):/, 'gr: keys are allowed by the existing practice_items rule');
  const rows = [{id: '1', topic: 'A', topic_key: 'a', source: 'topic', payload: {}, used_on: '2026-11-25'}, {id: '2', topic: 'B', topic_key: 'b', source: 'topic', payload: {}}, {id: '3', topic: 'E', topic_key: 'e', source: 'error', payload: {}, used_on: '2026-11-20'}];
  assert.deepEqual(pickBank(rows, {topic: 4, error: 2, review: 1}, '2026-11-26').map(r => r.id).sort(), ['2', '3'], 'not used in the last 3 days');
});

test('daily set: 10 questions = 4 learning-line grammar · 3 own words · 2 applications of own mistakes · 1 review; built-in fills gaps', () => {
  const words = Array.from({length: 8}, (_, i) => ({id: 'w' + i, term: ['casa', 'mesa', 'carro', 'livro', 'janela', 'porta', 'cadeira', 'praia'][i], translation: ['house', 'table', 'car', 'book', 'window', 'door', 'chair', 'beach'][i], pos: 'noun', status: 'new', due_at: '2026-01-01', wrong_count: 0, streak: 0}));
  const bq = (src, n) => Array.from({length: n}, (_, i) => toQuestion({id: src + i, topic: src + ' topic ' + i, topic_key: src + i, source: src, payload: {...mc(), kind: 'mc'}}, i));
  const base = {studentId: 's1', day: '2026-11-26', level: 'A2', lang: 'pt', words, mistakes: [], homework: [], state: []};
  const s = buildDaily({...base, ai: {topic: bq('topic', 4), error: bq('error', 2), review: bq('review', 1)}});
  assert.equal(s.questions.length, 10);
  assert.equal(s.questions.filter(q => q.bank).length, 7); assert.equal(s.questions.filter(q => q.source === 'word').length, 3);
  assert.ok(s.questions.every(q => q.prompt || q.sub), 'no empty questions');
  // no personal mistakes yet → filled with learning-line / built-in grammar, never invented mistakes
  const t = buildDaily({...base, ai: {topic: bq('topic', 2), error: [], review: []}});
  assert.equal(t.questions.length, 10); assert.equal(t.questions.filter(q => q.source === 'mistake').length, 0);
  assert.ok(t.questions.filter(q => q.source === 'grammar').length >= 5, 'grammar fills what mistakes cannot');
  // without the bank (no AI) the day is grammar-first, not mostly translations
  const u = buildDaily({...base, level: 'A1'});
  assert.ok(u.questions.filter(q => q.source === 'grammar').length >= 4 && u.questions.filter(q => q.kind === 'flash').length <= 3);
});

test('generation: only on the student\'s click, one batch, compact context, validated, reused; registration once per day', () => {
  const r = read('app/api/daily/prepare/route.ts');
  assert.equal((r.match(/askFast\(/g) || []).length, 1, 'one AI call per batch');
  assert.match(r, /if \(need && \(tTargets\.length \|\| eTargets\.length \|\| rTarget\)\)/, 'no call when the bank already has today\'s questions');
  assert.match(r, /e\.status !== 'rejected' && !e\.later && e\.certainty === 'certain' && e\.kind === 'error'/, 'only certain, teacher-kept mistakes (no style, slips or transcription doubts)');
  assert.match(r, /recommendTopics\(goals,/, 'targets from the personal learning line');
  assert.match(r, /invalidReason\(q, \{forbidden\}\)/); assert.match(r, /await enforceLimit\(db, user\.id, 'exercises'\);/);
  assert.ok(!/transcript/.test(r.replace(/\/\/.*$/gm, '')), 'no transcripts sent');
  const p = read('components/DailyPractice.tsx');
  assert.match(p, /if \(!d\.doneToday && !run\.finished\) void supabase\(\)!\.from\('practice_sessions'\)\.insert/, 'the daily session (and its XP) once per day');
  assert.match(p, /from\('daily_runs'\)\.select\('questions,answers,finished_at'\)/, 'continue after refresh / on another device');
  assert.match(p, /\/api\/daily\/prepare/); assert.ok(!/useEffect\(\(\) => \{[^}]*\/api\/daily\/prepare/.test(p), 'never on page open');
  const sql = read('supabase/v75.sql');
  assert.ok(!/\b(drop table|delete from|truncate|alter table public\.(students|practice_sessions|vocab_items))\b/i.test(sql), 'additive only');
});

test('dashboard: header pills, challenge + compact next lesson, journey with XP levels separate from CEFR, no scrollspy', () => {
  assert.deepEqual(levelOf(0), {level: 1, into: 0, need: 100, toNext: 100}); assert.equal(levelOf(250).level, 3); assert.equal(XP_PER_LEVEL, 100);
  const sd = read('components/StudentDash.tsx');
  for (const s of ['sd-head', '<RouteCard', '<NextLessonPanel mode="student" compact/>', 'sd-journey', 'XP-levels staan los van je taalniveau', '<WordsCard', '<GrammarCard', 'ms.slice(0,3)']) assert.ok(sd.includes(s), s);
  assert.match(read('components/Agenda.tsx'), /\{!compact&&next&&after\.length>0&&/, 'following lessons stay in the agenda');
  assert.match(read('components/Overview.tsx'), /if\(!open\.length\)return null;/, 'tasks card only with open tasks');
  assert.ok(!/SectionLinks/.test(read('components/Nav.tsx')));
});
