import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lastMonths, lessonsPerMonth, wordsPerMonth, cumulativeWords, homeworkProgress, groupCount, activeStudents, isEmptySeries} from '../../lib/stats.ts';

const now = new Date('2026-11-14T12:00:00Z');
const L = [
  {student_id: 'a', lesson_date: '2026-11-03', words: [1, 2, 3]},
  {student_id: 'a', lesson_date: '2026-11-10', words: [1]},
  {student_id: 'b', lesson_date: '2026-09-20', words: null},
  {student_id: 'b', lesson_date: '2026-01-05', words: [1, 2]}, // before 6-month window
];

test('last months window, oldest first, year shown in January', () => {
  assert.deepEqual(lastMonths(3, now).map(m => m.key), ['2026-09', '2026-10', '2026-11']);
  assert.equal(lastMonths(12, now)[1].label, 'jan 26');
});
test('lessons and words per month come only from stored rows', () => {
  assert.deepEqual(lessonsPerMonth(L, 3, now).map(p => p.value), [1, 0, 2]);
  assert.deepEqual(wordsPerMonth(L, 3, now).map(p => p.value), [0, 0, 4]);
});
test('cumulative words include history before the window', () => {
  assert.deepEqual(cumulativeWords(L, 3, now).map(p => p.value), [2, 2, 6]);
});
test('homework progress; no published homework gives null percentage (not 0%)', () => {
  assert.deepEqual(homeworkProgress([{id: 'x', published_at: 't'}, {id: 'y', published_at: 't'}, {id: 'z', published_at: null}], [{assignment_id: 'x'}, {assignment_id: 'x'}, {assignment_id: 'z'}]), {published: 2, submitted: 1, open: 1, pct: 50});
  assert.equal(homeworkProgress([], []).pct, null);
});
test('grouping by subject folds the tail into Overig', () => {
  const g = groupCount(L, id => (id === 'a' ? 'Nederlands' : ''), 1);
  assert.deepEqual(g.map(p => [p.label, p.value]), [['Nederlands', 2], ['Overig', 2]]);
});
test('active students and empty detection', () => {
  assert.equal(activeStudents(L, 30, now), 1);
  assert.equal(isEmptySeries(lessonsPerMonth([], 3, now)), true);
});
