import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkText, practiceOrder, mcOptions, sessionsPerWeek} from '../../lib/answers.ts';

test('answer check: case, spaces and end punctuation ignored; accents reported separately', () => {
  assert.equal(checkText('  Valer a pena. ', ['valer a pena']), 'correct');
  assert.equal(checkText('voce', ['você']), 'accent');
  assert.equal(checkText('vocês', ['você']), 'wrong');
  assert.equal(checkText('', ['x']), 'wrong');
  assert.equal(checkText('nog steeds', ['nog', 'nog steeds']), 'correct');
});
test('practice order: due words first, mastered last, hard words before easy', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  const items = [
    {id: 'future', due_at: '2026-12-01T00:00:00Z', status: 'practicing', wrong_count: 0},
    {id: 'mastered', due_at: '2026-11-01T00:00:00Z', status: 'mastered', wrong_count: 0},
    {id: 'dueHard', due_at: '2026-11-10T00:00:00Z', status: 'practicing', wrong_count: 4},
    {id: 'dueEasy', due_at: '2026-11-09T00:00:00Z', status: 'new', wrong_count: 0},
  ];
  assert.deepEqual(practiceOrder(items, now).map(x => x.id), ['dueHard', 'dueEasy', 'mastered', 'future']);
});
test('multiple choice: correct answer included once, distinct distractors, deterministic per seed', () => {
  const o = mcOptions('nog', ['nog', 'blijven', 'lukken', 'Nog', 'de moeite waard', 'al'], 7);
  assert.equal(o.length, 4);
  assert.equal(o.filter(x => x.toLowerCase() === 'nog').length, 1);
  assert.deepEqual(mcOptions('nog', ['a', 'b', 'c', 'd'], 7), mcOptions('nog', ['a', 'b', 'c', 'd'], 7));
  assert.deepEqual(mcOptions('x', [], 1), ['x']);
});
test('practice sessions per week, Monday-based', () => {
  const w = sessionsPerWeek([{created_at: '2026-11-10T09:00:00Z'}, {created_at: '2026-11-14T09:00:00Z'}, {created_at: '2026-11-08T09:00:00Z'}], 2, new Date('2026-11-14T12:00:00Z'));
  assert.deepEqual(w.map(x => x.value), [1, 2]);
  assert.equal(w[1].key, '2026-11-09');
});
