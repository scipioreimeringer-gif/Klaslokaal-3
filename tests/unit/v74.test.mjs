// v74: video settings per account and role, compact settings, one streak definition, derived (idempotent) XP,
// week goal, milestones from real data, teacher figures per currency.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {xpOf, practiceDays, weekProgress, goalWeeks, milestones, weekOf, GAME_CAP_PER_DAY} from '../../lib/motivation.ts';
import {streaks} from '../../lib/progressStats.ts';
import {prefsToApply, PREF_KEYS} from '../../lib/classroomPrefs.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const TZ = 'Europe/Amsterdam';

test('XP is derived from stored activities: no double award, capped games, never touches level or status', () => {
  const daily = (day) => ({created_at: day + 'T09:00:00Z', total: 8, kind: 'daily', details: {day}});
  const game = (iso, total = 10) => ({created_at: iso, total, kind: 'quiz'});
  const practice = [daily('2026-11-24'), daily('2026-11-24') /* same day twice (retry/refresh) */, daily('2026-11-25'),
    ...Array.from({length: 10}, (_, i) => game(`2026-11-25T1${i % 10}:00:00Z`)), game('2026-11-25T08:00:00Z', 2) /* too short: no XP */];
  const x = xpOf({practice, homeworkDone: 2, lessons: 3, goal: 7, tz: TZ});
  assert.equal(x.daily, 40, 'one daily XP per day'); assert.equal(x.games, GAME_CAP_PER_DAY * 10, 'game rounds capped per day');
  assert.equal(x.homework, 60); assert.equal(x.lessons, 150); assert.equal(x.weeks, 0);
  assert.equal(xpOf({practice: [...practice, ...practice], homeworkDone: 2, lessons: 3, goal: 7, tz: TZ}).total, x.total, 'the same activities twice → same XP');
  const lib = read('lib/motivation.ts');
  assert.ok(!/update\(|insert\(|level|mastered'\)/.test(lib.replace(/\/\/.*$/gm, '')), 'XP never writes anything, never changes level/status');
});

test('one streak definition (any practice, local day); week goal; goal weeks', () => {
  const rows = [{created_at: '2026-11-23T23:30:00Z', total: 5, kind: 'quiz'} /* 00:30 local on the 24th */, {created_at: '2026-11-25T10:00:00Z', total: 5, kind: 'daily', details: {day: '2026-11-25'}}, {created_at: '2026-11-26T08:00:00Z', total: 5, kind: 'flashcards'}];
  const days = practiceDays(rows, TZ);
  assert.deepEqual(days, ['2026-11-24', '2026-11-25', '2026-11-26'], 'the local calendar day, not the UTC date');
  assert.deepEqual(streaks(days, '2026-11-26'), {current: 3, longest: 3});
  const w = weekProgress(days, 3, '2026-11-26');
  assert.equal(weekOf('2026-11-26'), '2026-11-23'); assert.equal(w.done, 3); assert.equal(w.reached, true); assert.equal(w.week.length, 7);
  assert.deepEqual(goalWeeks(days, 3), ['2026-11-23']);
  const dp = read('components/DailyPractice.tsx');
  assert.match(dp, /streak: streaks\(allDays\.length \? allDays : days, day\)\.current/, 'the daily card uses the same streak as Voortgang');
  assert.match(read('components/Progress.tsx'), /const days=practiceDays\(d\.practice\);/);
});

test('milestones only from real data; dates when known; words practised ≠ added', () => {
  const ms = milestones({lessonDates: Array.from({length: 10}, (_, i) => `2026-0${1 + (i % 9)}-1${i % 9}`), lessonMinutes: [{date: '2026-02-01', minutes: 200}, {date: '2026-03-01', minutes: 120}],
    homeworkDates: ['2026-05-02T10:00:00Z'], practisedWords: 120, masteredDates: [], goalWeeks: []});
  const keys = ms.map(m => m.key).sort();
  assert.deepEqual(keys, ['hours5', 'hw1', 'lesson1', 'lesson10', 'words100']);
  assert.equal(ms.find(m => m.key === 'hours5').date, '2026-03-01');
  assert.equal(ms.find(m => m.key === 'words100').date, null, 'no invented date');
  assert.equal(milestones({lessonDates: [], lessonMinutes: [], homeworkDates: [], practisedWords: 99, masteredDates: [], goalWeeks: []}).length, 0);
});

test('video settings: per role keys, synced per account (never teacher ↔ student), newest copy wins', () => {
  assert.ok(PREF_KEYS.includes('klas-pip-auto-t') && PREF_KEYS.includes('klas-pip-auto-s') && PREF_KEYS.includes('klas-camset-s') && PREF_KEYS.includes('klas-lay72-t'));
  assert.ok(!PREF_KEYS.includes('klas-self') && !PREF_KEYS.includes('klas-pip-auto'), 'no shared (role-less) keys');
  assert.deepEqual(prefsToApply({at: 5, values: {'klas-camset-t': {view: 'side'}, other: 1}}, 4), {'klas-camset-t': '{"view":"side"}'});
  assert.deepEqual(prefsToApply({at: 3, values: {'klas-camset-t': {}}}, 4), {}, 'an older account copy never overwrites newer device settings');
  const html = read('public/legacy/index.html');
  assert.match(html, /KEY = "klas-pip-auto-" \+ \(isT \? "t" : "s"\)/); assert.match(html, /store\("klas-self-" \+ \(isT \? "t" : "s"\), selfView\)/);
  const blk = html.slice(html.indexOf('v74: COMPACT CAMERA'));
  assert.match(blk, /grid-template-columns:1fr 1fr/); assert.match(blk, /if\(cb && !autoOk\)\{ cb\.checked = false; cb\.disabled = true; \}/, 'unsupported browsers: no fake "on"');
  assert.ok(!/send\(/.test(blk.slice(0, blk.indexOf('</script>'))), 'settings are never sent to the other participant');
  const live = read('app/klaslokaal/live/page.tsx');
  assert.match(live, /const prefsReady=useClassroomPrefs\(\);/); assert.match(live, /\{prefsReady&&<iframe/);
});

test('teacher figures: per currency, confirmed payments only, planned lessons never counted as income', () => {
  const to = read('components/TeacherOverview.tsx');
  assert.match(to, /fmtMoney\(fin\.received,loc\)/); assert.match(to, /Omzet in andere valuta telt niet mee voor dit doel\./);
  assert.ok(!/planned[^\n]*price|price[^\n]*planned/.test(to));
  assert.match(read('lib/billing.ts'), /if \(l\.payment_status === 'paid' && inMonth\(l\.payment_confirmed_at, month\)\) add\(received/);
  const nav = read('components/Nav.tsx');
  assert.match(nav, /new IntersectionObserver/); assert.match(nav, /prefers-reduced-motion: reduce/);
  for (const x of ['XP', 'Mijlpalen', 'Streak']) assert.ok(!new RegExp(`label:tt\\('${x}'\\)`).test(nav), 'no new main menu items');
});
