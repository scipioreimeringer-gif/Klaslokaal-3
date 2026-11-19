// v44: simpler navigation (five tabs per role), Lessen as the central place with a page per lesson,
// filters on the central word list, Voortgang for students, Huiswerk cards.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {filterVocab, vocabFacets} from '../../lib/vocab/filter.ts';
import {hwKind, hwStatusOf, hwProgress, dueIn} from '../../lib/homework.ts';
import {lessonCards} from '../../lib/lessonCards.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const ws = read('components/StudentData.tsx');

test('old deep links keep working: analyses → Lessen, doelen → Voortgang for a student, unknown → Home', () => {
  assert.match(ws, /const x=t==='analyses'\?'lessen':t==='taken'\?'huiswerk':t\|\|'overzicht';/);
  assert.match(ws, /if\(viewer==='student'&&x==='doelen'\)return 'voortgang';/);
  assert.match(ws, /if\(viewer==='student'&&x==='prive'\)return 'overzicht';/, 'private notes never for a student');
  assert.match(ws, /setManage\(initialTab==='analyses'\)/, 'the teacher dashboard link "AI-analyses" opens the report overview');
  assert.match(ws, /\{tab==='doelen'&&viewer==='teacher'&&/, 'Leerpad only for the teacher');
  assert.match(ws, /<a className="tabs-live" href=\{'\/klaslokaal\/live\?student='\+encodeURIComponent\(studentId\)\}/, 'live classroom always visible');
  for (const k of ["'bord'", "'opnames'", "'prive'", "'oefenen'"]) assert.ok(ws.includes(`{tab===${k}`), k + ' still reachable');
});
test('a lesson page: errors → grammar → this lesson\'s words → deeper look → summary and assignments; notes and homework of the lesson', () => {
  const r = read('components/LessonReport.tsx');
  const order = ['"Mijn fouten"', '"Grammaticale aandachtspunten"', '"Woordenlijst van deze les"', '"Verdieping"', '"Samenvatting en opdrachten"'].map(k => r.indexOf(k));
  assert.ok(order.every((v, i) => v > 0 && (!i || v > order[i - 1])));
  const lc = read('components/LessonCards.tsx');
  assert.match(lc, /from\('vocab_items'\)\.select\('term,translation,pos'\)\.eq\('student_id',studentId\)\.eq\('lesson_date',card\.date\)/, 'the lesson word list = the central list (no copy)');
  assert.match(lc, /\(card\.lessonId&&x\.lesson_id===card\.lessonId\)\|\|\(card\.analysis&&x\.analysis_id===card\.analysis\.id\)/, 'homework of this lesson');
  assert.match(lc, /<TeacherAnalyses studentId=\{studentId\} focusId=\{card\.analysis\.id\} onlyId=\{card\.analysis\.id\}/, 'teacher approval inside the lesson (existing component)');
  assert.match(lc, /\(viewer==='teacher'\|\|card\.status==='approved'\)/, 'students only see approved reports');
});
test('no unreachable reports: an analysis without a registered lesson gets its own card', () => {
  const cards = lessonCards([], [], [{id: 'a1', lesson_date: '2026-12-02', status: 'approved', final: {version: 2, categories: []}}]);
  assert.equal(cards.length, 1); assert.equal(cards[0].analysis.id, 'a1'); assert.equal(cards[0].number, 1);
});
test('Woorden: filters on lesson language, word class, level, lesson and status; facets only list what exists', () => {
  const items = [
    {term: 'het brood', status: 'new', lang: 'nl', pos: 'znw. · het', level: 'A1', lesson_date: '2026-11-25'},
    {term: 'lopen', status: 'mastered', lang: 'nl', pos: 'ww.', level: 'A2', lesson_date: '2026-11-27'},
    {term: 'omdat', status: 'practicing', lang: 'nl', pos: 'vw.', level: 'A2', lesson_date: '2026-11-27'},
  ];
  assert.deepEqual(filterVocab(items, {pos: 'verb'}).map(i => i.term), ['lopen']);
  assert.deepEqual(filterVocab(items, {level: 'A2', status: 'practicing'}).map(i => i.term), ['omdat']);
  assert.deepEqual(filterVocab(items, {lesson: '2026-11-25', q: 'bro'}).map(i => i.term), ['het brood']);
  const f = vocabFacets(items);
  assert.deepEqual(f.pos, ['noun', 'verb', 'conjunction']); assert.deepEqual(f.levels, ['A1', 'A2']); assert.deepEqual(f.lessons, ['2026-11-27', '2026-11-25']);
  assert.match(read('supabase/v44.sql'), /add column if not exists level text/);
});
test('Huiswerk: kind colour, status, deadline and progress from stored data only', () => {
  assert.equal(hwKind({items: [{type: 'fill_in'}, {type: 'conjugate'}, {type: 'translate'}]}), 'grammatica');
  assert.equal(hwKind({items: [{type: 'translate'}]}), 'woorden');
  assert.equal(hwKind(null), 'opdracht');
  const now = Date.parse('2026-11-20T12:00:00Z');
  assert.equal(hwStatusOf({published_at: null, origin: 'ai'}, [], true), 'review');
  assert.equal(hwStatusOf({published_at: 'x', due_at: '2026-11-18T22:59:00Z'}, [], false, now), 'late');
  assert.equal(hwStatusOf({published_at: 'x'}, [{submitted_at: 'y', answer: '', feedback_published_at: 'z'}], false), 'feedback');
  assert.equal(hwProgress([{submitted_at: 'y', answer: 'Interactief gemaakt: 6/8 automatisch goed.'}]), 75);
  assert.equal(hwProgress([]), 0);
  assert.equal(dueIn(null), null);
  assert.equal(dueIn('2026-11-23T12:00:00Z', now).days, 3);
  const h = read('app/huiswerk-client.tsx');
  assert.match(h, /<article key=\{a\.id\} className=\{'hw-card44 hwk-'\+hwKind\(a\.exercises\)\}>/);
  assert.match(h, /if\(a\.error&&\/due_at\/\.test\(a\.error\.message\)\)/, 'works before v44.sql is run');
});
test('Voortgang (student): lessons, words, grammar points, homework — no learning-path planning or private notes', () => {
  const p = read('components/StudentProgress.tsx');
  assert.match(p, /rpc\('student_lesson_summaries',\{sid:studentId\}\)/, 'approved reports only');
  assert.ok(!/teacher_private_notes|student_goal_progress|curriculum_goals/.test(p));
  assert.match(ws, /\{tab==='voortgang'&&viewer==='student'&&/);
});
