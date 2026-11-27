// v73: compact navigation, simple dashboards, Voortgang with statistics from real data only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lessonStats, practiceStats, streaks, vocabStats, homeworkStats, grammarStats, periodStart, correctPerWeek, wordGrowth} from '../../lib/progressStats.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const NOW = Date.parse('2026-11-25T12:00:00Z');

test('statistics: only measured values, period filter, streaks, words in bank ≠ learned', () => {
  const lessons = [{lesson_date: '2026-11-24', session: {joint_seconds: 3600}}, {lesson_date: '2026-11-03', session: {joint_seconds: 1800}}, {lesson_date: '2025-01-10'}];
  assert.deepEqual(lessonStats(lessons, 'all', NOW), {count: 3, thisMonth: 2, minutes: 90, measured: 2, avgMinutes: 45}, 'an unmeasured older lesson adds no invented minutes');
  assert.equal(lessonStats(lessons, 'week', NOW).count, 1);
  assert.equal(lessonStats([], 'all', NOW).avgMinutes, null);
  assert.deepEqual(practiceStats([{created_at: '2026-11-25T08:00:00Z', score: 8, total: 10, kind: 'daily'}, {created_at: '2026-10-01T08:00:00Z', score: 1, total: 4, kind: 'quiz'}], 'month', NOW), {sessions: 1, answered: 10, correct: 8, pct: 80});
  assert.equal(practiceStats([], 'all', NOW).pct, null, 'no answers → no percentage');
  assert.deepEqual(streaks(['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-24', '2026-11-25'], '2026-11-25'), {current: 2, longest: 3});
  assert.deepEqual(streaks(['2026-11-24'], '2026-11-25'), {current: 1, longest: 1}, 'not yet practised today keeps yesterday\'s streak');
  const v = vocabStats([{status: 'new', created_at: '2026-11-24T10:00:00Z'}, {status: 'mastered', created_at: '2026-01-01', last_practiced_at: '2026-11-01'},
    {status: 'practicing', last_practiced_at: '2026-11-01', due_at: '2026-11-20T00:00:00Z'}, {status: 'practicing', difficult: true}], 'week', NOW);
  assert.deepEqual(v, {total: 4, added: 1, practised: 2, mastered: 1, review: 2});
  assert.deepEqual(homeworkStats([{id: 'a', published_at: 'x'}, {id: 'b', published_at: 'x'}, {id: 'c', published_at: null}], ['a']), {assigned: 2, done: 1, open: 1});
  assert.deepEqual(grammarStats([{status: 'covered'}, {status: 'in_progress'}, {status: 'review'}, {status: 'mastered'}, {status: 'not_started'}]), {covered: 4, mastered: 1, developing: 2, extra: 1}); // v75: the teacher's own "Extra oefenen"
  assert.equal(periodStart('all', NOW), 0);
  assert.ok(correctPerWeek([], 8, NOW).every(p => p.value === 0) && wordGrowth([], 6, new Date(NOW)).length === 6);
  const prog = read('components/Progress.tsx');
  assert.ok(!/authedPost|askFast|\/api\/ai/.test(prog), 'statistics use no AI');
  assert.match(prog, /Oefentijd wordt nog niet betrouwbaar gemeten/, 'unmeasured practice time is said, not invented');
  assert.match(prog, /e\.status!=='rejected'&&!e\.later&&e\.certainty==='certain'/, 'Werkpunten: only certain, teacher-kept mistakes');
});

test('navigation: teacher groups, six student items, collapsible to icons, build info moved', () => {
  const nav = read('components/Nav.tsx');
  assert.match(nav, /const work=\[\{href:'\/',icon:LayoutDashboard,label:tt\('Dashboard'\)\},\{href:'\/leerlingen'.*\{href:'\/klaslokaal\/live'.*\{href:'\/agenda'/);
  for (const g of ["label:tt('Lesmateriaal')", "label:tt('Administratie')", "role==='admin'?[{id:'beheer'"]) assert.ok(nav.includes(g), g);
  assert.match(nav, /const studentNav=\[\{href:'\/'.*'Overzicht'.*'\/mijn-profiel'.*'\/oefenen'.*'\/voortgang'.*'\/agenda'.*'\/klaslokaal\/live'/);
  assert.ok(!/studentNav=\[[^\]]*\/taken/.test(nav), 'no separate Taken item for students');
  assert.match(nav, /const isOpen=collapsed\|\|here\|\|!!gOpen\[g\.id\]/, 'the group of the active page opens by itself');
  assert.match(nav, /localStorage\.setItem\('teachy-nav-groups'/);
  assert.match(nav, /title=\{collapsed\?label:undefined\}/, 'tooltips when collapsed');
  assert.ok(!nav.includes('NEXT_PUBLIC_BUILD_SHA') && read('app/account/page.tsx').includes('NEXT_PUBLIC_BUILD_SHA'));
  assert.ok(existsSync(path.join(root, 'app/taken/page.tsx')) && existsSync(path.join(root, 'app/voortgang/page.tsx')), 'old route kept, new route added');
});

test('dashboards: compact, daily practice only while open, tasks from the existing task list, stats lazy', () => {
  const home = read('app/page.tsx');
  assert.match(home, /<TasksMini role="student" max=\{4\}\/>/); assert.match(home, /<TasksMini role="teacher"/);
  assert.match(home, /\{stats&&<TeacherStats\/>\}/, 'teacher charts only load when opened');
  assert.ok(!/ChartCard/.test(home.slice(home.indexOf('function StudentHome'))), 'no charts on the student overview');
  const ov = read('components/Overview.tsx');
  assert.match(ov, /if\(d\.doneToday\)return <p className="daily-done">/, 'done today → small confirmation only');
  assert.match(ov, /useTasks\(\)/); assert.ok(!/from\('tasks'\)\.insert/.test(ov), 'no second task system');
  assert.match(read('components/Agenda.tsx'), /href="\/agenda\?boeken=1"/);
  assert.match(read('app/agenda/page.tsx'), /openBooking=\{openBooking\}/);
});
