// v59: simple agenda — role-based buttons, filters only for multi-role users, multi-day blocks, booking messages.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
import {spreadByDay} from '../../lib/agenda.ts';
import {dayKey, addDays, planningError} from '../../lib/lessons.ts';

test('a holiday block appears on every day it covers (in the viewer\'s zone)', () => {
  const m = spreadByDay([{starts_at: '2026-12-21T23:00:00Z', ends_at: '2026-12-24T23:00:00Z'}], 'Europe/Amsterdam', dayKey, addDays);
  assert.deepEqual([...m.keys()], ['2026-12-22', '2026-12-23', '2026-12-24']);
  const one = spreadByDay([{starts_at: '2026-12-22T09:00:00Z', ends_at: '2026-12-22T10:00:00Z'}], 'UTC', dayKey, addDays);
  assert.deepEqual([...one.keys()], ['2026-12-22']);
});

test('booking errors are readable', () => {
  assert.match(planningError('NOT_AVAILABLE 2026-12-07 14:00'), /niet beschikbaar/);
  assert.match(planningError('TOO_SOON'), /uur van tevoren/);
  assert.match(planningError('NO_AVAILABILITY'), /geen beschikbaarheid/);
});

test('simple per role: max two main buttons, filters only with several roles, advanced under "Meer opties"', () => {
  const a = read('components/Agenda.tsx');
  assert.match(a, /const multi=canTeach&&isLearner;const shown:AgendaFilter=multi\?readFilter\(filter,canTeach\):'all';/);
  assert.match(a, /\{multi&&<div className="agenda-filters chipbar"/);
  assert.match(a, /t\('Les plannen'\)[\s\S]*t\('Persoonlijke afspraak'\)[\s\S]*t\('Tijd blokkeren'\)/, 'the add menu: three options (+ book for someone who also learns)');
  assert.match(a, /canTeach\?<button className="button secondary" onClick=\{\(\)=>setAvail\(true\)\}>/);
  assert.match(a, /:isLearner&&<button className="button" onClick=\{\(\)=>setBooking\(true\)\}>/, 'a learner: one clear "Les boeken" button');
  assert.match(a, /<details className="agenda-more"><summary>\{t\('Meer opties'\)\}<\/summary>[\s\S]*<GoogleCalendarPanel/, 'Google, time zone and cancelled lessons hidden under "Meer opties"');
  assert.match(a, /t\('Mijn wekelijkse beschikbaarheid'\)/);
  assert.match(a, /rpc\('book_lesson',\{p_student:sid,p_start:pick,p_minutes:minutes,p_weeks:weekly\?weeks:1\}\)/);
});
