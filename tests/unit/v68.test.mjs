// v68: lesson topics, the Brazilian-Portuguese curriculum A0–C1, links to homework, daily practice and analysis.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PTBR, PTBR_BY_CODE} from '../../lib/curriculum/ptbr.ts';
import {NT2} from '../../lib/curriculum/nt2.ts';
import {topicInfo, visibleGoals, goalTitle, recommendTopics} from '../../lib/curriculum/topics.ts';
import {focusKeys} from '../../lib/curriculum/focus.ts';
import {planBlocks} from '../../lib/homework/plan.ts';
import {buildDaily} from '../../lib/daily.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');

test('Portuguese curriculum: complete A0–C1 + continuous lines, stable unique ids, every field filled', () => {
  const per = l => PTBR.filter(t => t.level === l).length;
  assert.deepEqual([per('A1'), per('A2'), per('B1'), per('B2'), per('C1'), per('-')], [17, 14, 15, 12, 9, 10]);
  assert.equal(new Set(PTBR.map(t => t.code)).size, PTBR.length);
  for (const t of PTBR) {
    assert.match(t.code, /^ptbr-(a1|a2|b1|b2|c1|dl)-\d\d$/);
    assert.ok(t.title && t.pt && t.sub.length && t.ex.length && t.err.length, t.code);
  }
  assert.equal(PTBR_BY_CODE.get('ptbr-a1-03').pt, 'Ser e estar');
  assert.ok(PTBR_BY_CODE.get('ptbr-a2-04').ex.includes('Eu estava dormindo quando você ligou.'));
  // the Dutch curriculum is untouched (same ids)
  assert.ok(NT2.every(t => t.code.startsWith('nt2-')) && NT2.length >= 60);
});

test('migration v68: non-destructive, idempotent, carries Portuguese progress over without overwriting', () => {
  const sql = read('supabase/v68.sql');
  assert.ok(!/\b(drop table|delete from|truncate)\b/i.test(sql));
  assert.match(sql, /on conflict \(code\) do update set [\s\S]*? where public\.curriculum_goals\.owner_teacher is null/);
  assert.match(sql, /on conflict \(student_id, goal_id\) do nothing/);
  assert.match(sql, /add column if not exists note text/); assert.match(sql, /add column if not exists sub text\[\]/);
  for (const old of ['pt-A1-gr-1', 'pt-A1-gr-2', 'pt-A2-gr-5', 'pt-B1-gr-1', 'pt-B2-gr-1', 'pt-C1-gr-1']) assert.ok(sql.includes(`'${old}'`), old);
  assert.equal((sql.match(/'ptbr-[a-z0-9]+-\d\d', 'pt'/g) || []).length, PTBR.length);
});

test('view: structured curriculum replaces older standard goals in the view only; Portuguese titles in the Portuguese UI', () => {
  const goals = [{id: '1', code: 'pt-A1-gr-2', title: 'Ser vs. estar'}, {id: '2', code: 'ptbr-a1-03', title: 'Ser en estar'}, {id: '3', code: null, title: 'Eigen'}];
  assert.deepEqual(visibleGoals(goals, 'pt').map(g => g.id), ['2', '3']);
  assert.deepEqual(visibleGoals(goals.slice(0, 1), 'pt').map(g => g.id), ['1'], 'before the migration nothing disappears');
  assert.equal(goalTitle(goals[1], null, 'pt'), 'Ser e estar'); assert.equal(goalTitle(goals[1], null, 'nl'), 'Ser en estar');
  assert.equal(goalTitle(goals[1], 'Eigen naam', 'pt'), 'Eigen naam', "the teacher's rename wins");
  assert.equal(topicInfo('ptbr-dl-03').continuous, true);
});

test('recommendations: max five, extra practice and in development first, recent mistakes, repetition, next in line', () => {
  const now = Date.parse('2026-11-24');
  const T = (id, code, level, status, days = 1) => ({id, code, level, sort: +id, status, updated_at: new Date(now - days * 86400e3).toISOString()});
  const topics = [T('1', 'ptbr-a1-03', 'A1', 'mastered', 60), T('2', 'ptbr-a2-04', 'A2', 'review'), T('3', 'ptbr-a2-01', 'A2', 'in_progress'), T('4', 'ptbr-a1-10', 'A1', 'not_started'),
    T('5', 'ptbr-a1-11', 'A1', 'not_started'), T('6', 'ptbr-b2-09', 'B2', 'not_started'), T('7', 'ptbr-a1-07', 'A1', 'mastered', 3), T('8', 'ptbr-a2-10', 'A2', 'not_started')];
  const r = recommendTopics(topics, {level: 'A2', errorKeys: new Set(['por_para']), now});
  assert.ok(r.length <= 5);
  assert.deepEqual(r.slice(0, 2).map(x => x.id), ['2', '3']);
  assert.ok(r.some(x => x.id === '8' && x.reason === 'error'), 'recent mistakes (por/para)');
  assert.ok(r.some(x => x.id === '1' && x.reason === 'repeat'), 'mastered 60 days ago comes back');
  assert.ok(!r.some(x => x.id === '6'), 'no B2 topic for an A2 learner'); assert.ok(!r.some(x => x.id === '7'), 'recently mastered: not yet');
  assert.ok(!recommendTopics(topics, {level: 'A2', exclude: new Set(['2']), now}).some(x => x.id === '2'), 'already chosen topics are not recommended');
});

test('lesson topics: optional in the agenda and the classroom; planned ≠ covered; observation; never overwrites an assessment', () => {
  const c = read('components/LessonTopics.tsx');
  assert.match(c, /o==='covered'&&x\.goal_id&&\(!prog\[x\.goal_id\]\|\|prog\[x\.goal_id\]\.status==='not_started'\)/);
  assert.match(c, /je kunt de les ook zo starten/);
  assert.match(read('components/Agenda.tsx'), /<LessonTopics studentId=\{l\.student_id\} lessonId=\{l\.id\}/);
  assert.match(read('app/klaslokaal/live/page.tsx'), /<LessonTopics studentId=\{s\.id\} lessonId=\{lessonRef\?\.id\|\|null\}/);
  const lp = read('components/LearningPath.tsx');
  assert.match(lp, /async function toNextLesson/); assert.match(lp, /tab=huiswerk&onderwerp=/);
  const a = read('lib/server/analysisRunner.ts');
  assert.match(a, /g\.outcome !== 'not_covered'/); assert.match(a, /\[covered per teacher\]/); assert.match(a, /visibleGoals\(goals, subject\)/);
});

test('homework: focus "Geselecteerde lesonderwerpen" uses only the lesson topics; auto mode includes them too', () => {
  assert.ok(planBlocks(15, 'A2', 'lesson').every(b => b.role === 'recent' || b.weight > 1));
  const r = read('app/api/ai/exercises/route.ts');
  assert.match(r, /focus === 'lesson' \? lessonTopics/); assert.match(r, /recent: \[\.\.\.lessonTopics,/);
  assert.match(read('components/Learning.tsx'), /lesson:'Geselecteerde lesonderwerpen'/);
  assert.match(read('app/huiswerk-client.tsx'), /initialTopic=\{topicParam\|\|undefined\}/);
});

test('practice: learning-line topics in development and recent lesson topics weigh more in the daily practice', () => {
  const f = focusKeys([{status: 'review', curriculum_goals: {code: 'nt2-a2-01'}}, {status: 'mastered', curriculum_goals: {code: 'nt2-a1-05'}}], [{outcome: 'planned', curriculum_goals: {code: 'nt2-a1-07'}}, {outcome: 'not_covered', curriculum_goals: {code: 'nt2-a1-09'}}]);
  assert.ok(f.focus.includes('word_order') && !f.focus.includes('articles') && f.known.includes('articles') && !f.focus.includes('negation'));
  const base = {studentId: 's', day: '2026-11-24', level: 'A2', lang: 'nl', words: [], mistakes: [], homework: [], state: []};
  const count = s => s.questions.filter(q => q.source === 'grammar' && (/:in:/.test(q.ref) || q.label === 'Inversie')).length;
  let more = 0; for (let d = 1; d <= 10; d++) { const day = '2026-11-' + String(d).padStart(2, '0'); more += count(buildDaily({...base, day, focusTopics: ['inversion', 'word_order']})) - count(buildDaily({...base, day})); }
  assert.ok(more > 0, 'focus topics come up more often');
});
