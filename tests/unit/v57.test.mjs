// v57: central agenda (all roles, no duplicates, filters), add-to-calendar links, one-way Google events, smart tasks.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
import {mergeAgenda, applyFilter, readFilter, overlaps} from '../../lib/agenda.ts';
import {extraEventBody, extraEventId, extraFingerprint, googleTemplateUrl, outlookUrl, icsFile, classroomUrl, itemSummary} from '../../lib/gcal/items.ts';
import {eventIdFor} from '../../lib/gcal/map.ts';
import {teacherTasks, studentTasks, manualTasks, combine, sortTasks, filterTasks, badgeCount} from '../../lib/tasks.ts';
import {classroomHref, planningError} from '../../lib/lessons.ts';

const ME = 'me', L = (id, extra = {}) => ({id, student_id: 's-' + id, teacher_id: 'x', starts_at: '2026-12-07T13:00:00Z', ends_at: '2026-12-07T14:00:00Z', timezone: 'Europe/Amsterdam', language: null, status: 'scheduled', series_id: null, cancelled_at: null, ...extra});

test('central agenda: lessons I give + lessons I follow + personal, each lesson once', () => {
  const teach = L('a', {teacher_id: ME, student_id: 'madison'});
  const learn = L('b', {teacher_id: 'esther', student_id: 'my-pt', starts_at: '2026-12-07T16:00:00Z', ends_at: '2026-12-07T17:00:00Z'});
  const selfL = L('c', {teacher_id: ME, student_id: 'self'});
  const foreign = L('d', {teacher_id: 'x', student_id: 'z'});            // an admin can read it, but it is not mine
  const items = mergeAgenda(ME, [[teach, selfL, foreign], [learn, selfL, learn]], ['my-pt', 'self'], [{id: 'p', title: 'Tandarts', notes: null, starts_at: '2026-12-07T09:00:00Z', ends_at: '2026-12-07T10:00:00Z', timezone: 'Europe/Amsterdam', blocks_lessons: true}]);
  assert.deepEqual(items.map(i => i.key + '=' + i.kind), ['p:p=personal', 'l:a=teach', 'l:c=teach', 'l:b=learn']);
  assert.ok(!items.some(i => i.key === 'l:d'), 'never someone else\'s lesson');
  assert.deepEqual(applyFilter(items, 'learn').map(i => i.key), ['l:b']);
  assert.deepEqual(applyFilter(items, 'teach').map(i => i.key), ['l:a', 'l:c']);
  assert.deepEqual(applyFilter(items, 'personal').map(i => i.key), ['p:p']);
  assert.equal(applyFilter(items, 'all').length, 4);
});

test('filter is remembered and only valid values are used', () => {
  assert.equal(readFilter('learn', true), 'learn');
  assert.equal(readFilter('teach', false), 'all');                       // a pure learner has no "Ik geef les"
  assert.equal(readFilter('bogus', true), 'all');
  assert.equal(readFilter(null, true), 'all');
  const src = read('components/Agenda.tsx');
  assert.match(src, /localStorage\.setItem\('teachy-agenda-filter'/);
  assert.match(src, /'Ik geef les'/); assert.match(src, /'Ik volg les'/); assert.match(src, /'Persoonlijk'/); assert.match(src, /'Alles'/);
});

test('busy across roles (planning form warning)', () => {
  const items = mergeAgenda(ME, [[L('a', {teacher_id: ME}), L('b', {teacher_id: 'e', student_id: 'mine', starts_at: '2026-12-07T16:00:00Z', ends_at: '2026-12-07T17:00:00Z'})]], ['mine'],
    [{id: 'free', title: 'Lunch', notes: null, starts_at: '2026-12-07T11:00:00Z', ends_at: '2026-12-07T12:00:00Z', timezone: 'UTC', blocks_lessons: false}]);
  assert.equal(overlaps(items, Date.parse('2026-12-07T16:30:00Z'), Date.parse('2026-12-07T17:30:00Z')).length, 1, 'a lesson I follow makes me busy');
  assert.equal(overlaps(items, Date.parse('2026-12-07T11:00:00Z'), Date.parse('2026-12-07T12:00:00Z')).length, 0, 'not-busy appointment');
  assert.equal(overlaps(items, Date.parse('2026-12-07T13:00:00Z'), Date.parse('2026-12-07T14:00:00Z'), 'a').length, 0, 'moving a lesson ignores itself');
  assert.match(planningError('DOUBLE_BOOKING_PERSONAL 2026-12-09 10:00'), /persoonlijke afspraak/);
});

test('classroom link carries the role', () => {
  assert.match(classroomHref({id: 'L1', student_id: 'S1'}, 'student'), /student=S1&lesson=L1&als=leerling$/);
  assert.match(classroomHref({id: 'L1', student_id: 'S1'}, 'teacher'), /&als=docent$/);
  assert.doesNotMatch(classroomHref({id: 'L1', student_id: 'S1'}), /als=/);
  const live = read('app/klaslokaal/live/page.tsx');
  assert.match(live, /asParam==='leerling'\?'student'/, 'the role from the link is honoured only when both roles are real');
});

test('one-way Google events: stable ids, private, no duplicate with the two-way ids', () => {
  const item = {kind: 'learn', item_id: '11111111-2222-3333-4444-555555555555', student_id: 'S', starts_at: '2026-12-07T16:00:00Z', ends_at: '2026-12-07T17:00:00Z', timezone: 'Europe/Lisbon', language: 'pt', teacher_name: 'Esther'};
  assert.equal(extraEventId(item), 'trs11111111222233334444555555555555');
  assert.notEqual(extraEventId(item), eventIdFor(item.item_id));
  assert.match(extraEventId(item), /^[a-v0-9]{5,1024}$/, 'Google base32hex id');
  assert.equal(extraEventId({kind: 'personal', item_id: item.item_id}).slice(0, 3), 'trp');
  const body = extraEventBody(item, 'https://teachyrooms4u.vercel.app');
  assert.equal(body.visibility, 'private'); assert.equal(body.summary, 'Les Portugees · Esther (TeachyRooms)');
  assert.ok(!('attendees' in body), 'no guests');
  assert.equal(extraFingerprint(item, 'o'), extraFingerprint({...item}, 'o'));
  assert.notEqual(extraFingerprint(item, 'o'), extraFingerprint({...item, starts_at: '2026-12-07T16:30:00Z'}, 'o'));
  assert.equal(itemSummary({kind: 'personal', item_id: 'p', starts_at: '', ends_at: '', title: 'Tandarts'}), 'Tandarts');
  assert.match(classroomUrl(item, 'https://x'), /als=leerling/);
});

test('add to calendar without OAuth: Google, Outlook, .ics', () => {
  const item = {kind: 'learn', item_id: 'abc', student_id: 'S', starts_at: '2026-12-07T16:00:00Z', ends_at: '2026-12-07T17:00:00Z', timezone: 'Europe/Amsterdam', language: 'pt', teacher_name: 'Esther'};
  const g = new URL(googleTemplateUrl(item, 'https://x'));
  assert.equal(g.searchParams.get('dates'), '20261207T160000Z/20261207T170000Z');
  assert.equal(g.searchParams.get('action'), 'TEMPLATE');
  const o = new URL(outlookUrl(item, 'https://x'));
  assert.equal(o.searchParams.get('startdt'), '2026-12-07T16:00:00.000Z');
  const ics = icsFile({...item, teacher_name: 'Esther; Silva, PhD'}, 'https://x', new Date('2026-11-23T00:00:00Z'));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/); assert.match(ics, /UID:abc@teachyrooms\r\n/); assert.match(ics, /DTSTART:20261207T160000Z/);
  assert.match(ics, /Esther\\; Silva\\, PhD/, 'escaped text');
  assert.ok(ics.split('\r\n').every(l => l.length <= 75), 'folded lines');
});

test('Google sync: consent before anything is sent, choice of types, Preply warning', () => {
  const gc = read('components/GoogleCalendar.tsx'), lib = read('lib/server/gcal.ts'), sqlf = read('supabase/v57.sql');
  assert.match(gc, /st\.confirmed!==false/, 'auto-sync waits for consent');
  assert.match(gc, /'Lessen die ik geef'/); assert.match(gc, /'Lessen die ik volg'/); assert.match(gc, /'Persoonlijke afspraken'/);
  assert.match(gc, /looksForeign/); assert.match(gc, /teaching:teacher,learning:true,personal:false/, 'default: both kinds of lessons');
  assert.match(lib, /needsConsent/);
  assert.match(sqlf, /sync_confirmed_at is not null/);
  assert.match(sqlf, /values \(me, left\(p_email, 320\), p_refresh_enc, public\.is_teacher\(\), true, false, null\)/, 'a new connection starts unconfirmed');
});

test('tasks: derived, close by themselves, no duplicates, priorities and filters', () => {
  const NOW = Date.parse('2026-12-07T09:00:00Z'), tz = 'Europe/Amsterdam';
  const t1 = teacherTasks({students: [{id: 'm', name: 'Madison', user_id: 'u'}, {id: 'n', name: 'Noor', user_id: 'u2'}, {id: 'old', name: 'Oud', archived_at: '2026-01-01', user_id: 'u3'}],
    upcomingLessons: [{student_id: 'm', starts_at: '2026-12-08T10:00:00Z', status: 'scheduled'}],
    submissions: [{id: 'sub1', assignment_id: 'a', title: 'Tekst', student_id: 'm', submitted_at: '2026-12-03T10:00:00Z', feedback_published_at: null},
                  {id: 'sub2', assignment_id: 'b', title: 'Klaar', student_id: 'm', submitted_at: '2026-12-03T10:00:00Z', feedback_published_at: '2026-12-04T10:00:00Z'}],
    failedReports: [{id: 'r1', student_id: 'n', lesson_date: '2026-12-01'}]}, NOW, tz);
  assert.deepEqual(t1.map(x => x.key.split(':').slice(0, 2).join(':')).sort(), ['plan:n', 'report:r1', 'review:sub1']);
  assert.equal(t1.find(x => x.key === 'review:sub1').priority, 'high', 'waiting > 2 days');
  const s1 = studentTasks({assignments: [{id: 'h1', title: 'Oefening', student_id: 'p', due_at: '2026-12-07T20:00:00Z', published_at: 'x'}, {id: 'h2', title: 'Ingeleverd', student_id: 'p', due_at: null, published_at: 'x'}, {id: 'h3', title: 'Concept', student_id: 'p', due_at: null, published_at: null}],
    submittedAssignmentIds: ['h2'], nextLessons: [{id: 'L', student_id: 'p', starts_at: '2026-12-07T16:00:00Z', ends_at: '2026-12-07T17:00:00Z', status: 'scheduled', teacher_name: 'Esther'}], pendingConsents: []}, NOW);
  assert.deepEqual(s1.map(x => x.key), ['hw:h1', 'lesson:L']);
  assert.equal(s1[0].priority, 'high'); assert.match(s1[1].href, /als=leerling/);
  const all = combine([t1, s1, s1, manualTasks([{id: 'k', title: 'Eigen', notes: null, priority: 'low', due_at: null, role: 'teacher', student_id: null, done_at: null}])], ['report:r1']);
  assert.equal(all.length, t1.length + s1.length + 1, 'no duplicates');
  assert.equal(all.find(x => x.key === 'report:r1').done, true, 'dismissed automatic task counts as done');
  const sorted = sortTasks(all);
  assert.equal(sorted[sorted.length - 1].key, 'report:r1', 'done last');
  assert.deepEqual(filterTasks(sorted, 'done', NOW, tz).map(x => x.key), ['report:r1']);
  assert.ok(filterTasks(sorted, 'today', NOW, tz).some(x => x.key === 'hw:h1') && !filterTasks(sorted, 'today', NOW, tz).some(x => x.key === 'manual:k'));
  assert.ok(filterTasks(sorted, 'week', NOW, tz).some(x => x.key === 'review:sub1'));
  assert.equal(badgeCount(sorted, NOW, tz), filterTasks(sorted, 'today', NOW, tz).length);
  const nav = read('components/Nav.tsx');
  assert.match(nav, /href:'\/taken'/); assert.match(nav, /<TaskBadge\/>/);
});
