// v61: payment administration — per-currency sums, received vs given value, payment tasks close themselves.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
import {summary} from '../../lib/billing.ts';
import {teacherTasks} from '../../lib/tasks.ts';

const NOW = Date.parse('2026-11-24T12:00:00Z');
const L = (id, o) => ({id, student_id: 's', starts_at: '2026-11-10T10:00:00Z', ends_at: '2026-11-10T11:00:00Z', status: 'scheduled', price_cents: 3500, currency: 'EUR', ...o});

test('money per currency; received apart from the value of given lessons; unknown is not unpaid', () => {
  const s = summary([
    L('a', {payment_status: 'paid', payment_confirmed_at: '2026-11-12T09:00:00Z'}),
    L('b', {payment_status: 'open'}),
    L('c', {payment_status: 'reported', price_cents: 20000, currency: 'BRL'}),
    L('d', {payment_status: null}),
    L('e', {payment_status: 'open', starts_at: '2026-12-10T10:00:00Z', ends_at: '2026-12-10T11:00:00Z'}),
  ], [{id: 'p', lessons_total: 4, used: 1, remaining: 3, price_cents: 12000, currency: 'EUR', paid_at: '2026-11-02T10:00:00Z'}], '2026-11', NOW);
  assert.deepEqual(s.received, {EUR: 3500 + 12000});
  assert.deepEqual(s.outstanding, {EUR: 3500, BRL: 20000}, 'never added across currencies; a future lesson is not outstanding yet');
  assert.equal(s.lessonsGiven, 4, 'given lessons counted, whatever their payment status');
  assert.equal(s.prepaidLeft, 3);
});

test('payment tasks: from data, one per lesson/package, gone once confirmed', () => {
  const base = {students: [{id: 's', name: 'Madison', user_id: 'u'}], upcomingLessons: [{student_id: 's', starts_at: '2026-11-30T10:00:00Z', status: 'scheduled'}], submissions: [], failedReports: []};
  const t1 = teacherTasks({...base, payments: [{id: 'a', student_id: 's', ends_at: '2026-11-23T11:00:00Z', payment_status: 'reported'}, {id: 'b', student_id: 's', ends_at: '2026-11-10T11:00:00Z', payment_status: 'open'}, {id: 'c', student_id: 's', ends_at: '2026-11-23T11:00:00Z', payment_status: 'open'}],
    packages: [{id: 'p1', student_id: 's', remaining: 0, mode: 'package', newest: false}, {id: 'p2', student_id: 's', remaining: 1, mode: 'package', newest: true}]}, NOW, 'UTC');
  assert.deepEqual(t1.map(x => x.key).sort(), ['pay-check:a', 'pay-open:b', 'pkg-low:p2'], 'open only after 3 days; only the newest package');
  const t2 = teacherTasks({...base, payments: [], packages: []}, NOW, 'UTC');
  assert.equal(t2.length, 0, 'confirmed → no task left');
});

test('wiring: compact icon, details block, finance card, page, nothing to Google', () => {
  const a = read('components/Agenda.tsx');
  assert.match(a, /' pay-'\+\(i\.lesson\.payment_status==='paid'\?'paid'/); assert.match(a, /className="done-check" title=\{t\('Les afgerond'\)\}/); // v63: colours by payment + completion check assert.match(a, /<LessonPayment lesson=\{l\} mode=\{mode\}/);
  assert.match(read('app/page.tsx'), /<TeacherFigures ids=/); // v74: received/outstanding as dashboard tiles (same summary as the card)
  assert.match(read('components/Payments.tsx'), /export function useFinanceSummary\(\)/);
  assert.ok(!/payment|price_cents/.test(read('lib/gcal/map.ts') + read('lib/gcal/items.ts')), 'calendar events never contain payment data');
});
