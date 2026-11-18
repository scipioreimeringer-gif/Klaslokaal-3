import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lessonState, dayKey, clock, gridDays, shift, weekStart, byDay, nextLesson, countdown, planningError, minutesOf} from '../../lib/lessons.ts';
import {setCurrentLang, loadMessages} from '../../lib/i18n.ts';

const L = (id, s, e, extra = {}) => ({id, student_id: 'x', teacher_id: 't', starts_at: s, ends_at: e, timezone: 'Europe/Amsterdam', language: null, status: 'scheduled', series_id: null, cancelled_at: null, ...extra});
const now = Date.parse('2026-11-20T18:30:00Z');

test('status: scheduled, live, completed, cancelled', () => {
  assert.equal(lessonState(L('a', '2026-11-20T19:00:00Z', '2026-11-20T20:00:00Z'), now), 'scheduled');
  assert.equal(lessonState(L('a', '2026-11-20T18:00:00Z', '2026-11-20T19:00:00Z'), now), 'live');
  assert.equal(lessonState(L('a', '2026-11-20T17:00:00Z', '2026-11-20T18:00:00Z'), now), 'completed');
  assert.equal(lessonState(L('a', '2026-11-20T19:00:00Z', '2026-11-20T20:00:00Z', {status: 'cancelled'}), now), 'cancelled');
});

test('the same instant is shown in each viewer\'s own zone (teacher NL, student BR)', () => {
  const s = '2026-11-20T18:00:00Z';
  assert.equal(clock(s, 'Europe/Amsterdam'), '19:00');
  assert.equal(clock(s, 'America/Sao_Paulo'), '15:00');
  assert.equal(dayKey('2026-11-21T01:30:00Z', 'Europe/Amsterdam'), '2026-11-21');
  assert.equal(dayKey('2026-11-21T01:30:00Z', 'America/Sao_Paulo'), '2026-11-20', 'late evening in Brazil is still the previous day');
});

test('summer time: weekly 19:00 Amsterdam stays 19:00 locally', () => {
  assert.equal(clock('2026-10-18T17:00:00Z', 'Europe/Amsterdam'), '19:00');
  assert.equal(clock('2026-10-25T18:00:00Z', 'Europe/Amsterdam'), '19:00');
});

test('calendar grid: week starts Monday, month covers full weeks, navigation', () => {
  assert.equal(weekStart('2026-11-20'), '2026-11-16');
  assert.deepEqual(gridDays('2026-11-20', 'week'), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
  const m = gridDays('2026-11-20', 'month');
  assert.equal(m[0], '2026-10-26'); assert.equal(m.length % 7, 0); assert.ok(m.includes('2026-11-30')); assert.equal(m.at(-1), '2026-12-06');
  assert.deepEqual(gridDays('2026-11-20', 'day'), ['2026-11-20']);
  assert.equal(shift('2026-01-31', 'month', 1).slice(0, 7), '2026-02');
  assert.equal(shift('2026-11-20', 'week', -1), '2026-11-13');
});

test('grouping per day and next lesson (running lesson counts, cancelled skipped)', () => {
  const ls = [L('c', '2026-11-21T09:00:00Z', '2026-11-21T10:00:00Z'), L('x', '2026-11-20T18:45:00Z', '2026-11-20T19:45:00Z', {status: 'cancelled'}), L('b', '2026-11-20T18:00:00Z', '2026-11-20T19:00:00Z')];
  const g = byDay(ls, 'Europe/Amsterdam');
  assert.deepEqual([...g.keys()], ['2026-11-20', '2026-11-21']);
  assert.equal(nextLesson(ls, now).id, 'b');
  assert.equal(nextLesson([L('o', '2026-11-19T10:00:00Z', '2026-11-19T11:00:00Z')], now), null);
  assert.equal(minutesOf(ls[0]), 60);
});

test('countdown and readable planning errors (translated)', async () => {
  await loadMessages();
  setCurrentLang('nl');
  assert.equal(countdown('2026-11-20T18:42:00Z', now), 'Over 12 min');
  assert.equal(countdown('2026-11-20T21:50:00Z', now), 'Over 3 u 20 min');
  assert.equal(countdown('2026-11-23T18:30:00Z', now), 'Over 3 dagen');
  assert.equal(countdown('2026-11-20T18:00:00Z', now), 'Nu bezig');
  assert.match(planningError('DOUBLE_BOOKING_STUDENT 2026-11-20 15:30'), /andere docent/);
  setCurrentLang('en');
  assert.match(planningError('DOUBLE_BOOKING_TEACHER 2026-11-20 15:30'), /^Double booking: you already have a lesson on .*15:30\.$/);
  assert.equal(countdown('2026-11-20T18:42:00Z', now), 'In 12 min');
  setCurrentLang('nl');
});
