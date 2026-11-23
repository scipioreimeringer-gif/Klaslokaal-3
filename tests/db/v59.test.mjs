// v59: weekly availability, time blocks, learners booking single/weekly lessons — conflicts, access, time zones.
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql', 'v43.sql', 'v44.sql', 'v45.sql', 'v47.sql', 'v48.sql', 'v52.sql', 'v56.sql', 'v57.sql', 'v58.sql']) await pg.exec(sql(f));
await pg.exec(sql('v59.sql')); await pg.exec(sql('v59.sql'));
ok(true, 'v59 runs (twice → idempotent)');

const T = '00000000-0000-0000-0000-0000000000b1', L = '00000000-0000-0000-0000-0000000000b2', L2 = '00000000-0000-0000-0000-0000000000b3', T2 = '00000000-0000-0000-0000-0000000000b4';
await pg.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${T}','esther@x.nl',now()),('${L}','scipio@x.nl',now()),('${L2}','other@x.nl',now()),('${T2}','t2@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T}','esther@x.nl','teacher'),('${L}','scipio@x.nl','admin'),('${L2}','other@x.nl','student'),('${T2}','t2@x.nl','teacher') on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const fails = async (fn, re) => { try { await fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const st = async (teacher, user, email) => (await pg.query(`insert into public.students(teacher_id,email,name,curriculum_subject,level,user_id) values ($1,$2,'S','pt','A2',$3) returning id`, [teacher, email, user])).rows[0].id;
const rel = await st(T, L, 'scipio@x.nl');            // Esther (São Paulo) teaches me
const relOther = await st(T, L2, 'other@x.nl');
const myStudent = await st(L, L2, 'other@x.nl');       // I (L) also teach someone

// a Monday 3 weeks ahead (future, fixed weekday)
const monday = (await pg.query(`select (date_trunc('week', now() + interval '21 days'))::date d`)).rows[0].d;
const day = n => new Date(Date.parse(monday + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);

console.log('\n=== availability ===');
ok(await fails(() => q(L2, `select public.save_availability('Europe/Amsterdam','[]')`), /Not authorized/), 'only teachers can set availability');
const n = (await q(T, `select public.save_availability('America/Sao_Paulo','[{"weekday":1,"start":"09:00","end":"12:00"},{"weekday":1,"start":"14:00","end":"18:00"},{"weekday":3,"start":"10:00","end":"11:00"}]') n`)).rows[0].n;
ok(n === 3, 'Monday two blocks + Wednesday saved (several blocks per day)');
ok((await q(L, `select count(*)::int n from public.teacher_availability`)).rows[0].n === 0, 'a learner cannot read the teacher\'s availability table');
ok(await fails(() => q(T, `insert into public.teacher_availability(weekday,start_time,end_time) values (2,'09:00','10:00')`), /permission|policy|denied/i), 'availability only changes through the checked function');

console.log('\n=== free slots, time zones ===');
const slots = async (uid, sid, d, tz, min = 60) => (await q(uid, `select starts_at from public.free_slots($1,$2::date,$3,$4)`, [sid, d, min, tz])).rows.map(r => new Date(r.starts_at).toISOString());
let s = await slots(L, rel, day(0), 'America/Sao_Paulo');
// São Paulo = UTC−3: 09:00–12:00 → 12:00–15:00 UTC (starts 12:00 … 14:00), 14:00–18:00 → 17:00–21:00 UTC (starts 17:00 … 20:00)
ok(s.length === 12 && s[0] === `${day(0)}T12:00:00.000Z` && s.includes(`${day(0)}T14:00:00.000Z`) && !s.includes(`${day(0)}T14:30:00.000Z`) && !s.includes(`${day(0)}T16:00:00.000Z`) && s[11] === `${day(0)}T20:00:00.000Z`,
  'two blocks in São Paulo time → 12 starts every 30 min, a 60-min lesson always fits inside a block');
const sAms = await slots(L, rel, day(0), 'Europe/Amsterdam');
ok(sAms.join() === s.join(), 'a learner in Amsterdam is offered exactly the same moments (shown in own time)');
ok((await slots(L, rel, day(1), 'America/Sao_Paulo')).length === 0, 'no availability on Tuesday → no slots');
ok(await fails(() => q(L2, `select * from public.free_slots($1,$2::date,60,'UTC')`, [rel, day(0)]), /Not authorized/), 'nobody can ask slots for someone else\'s relation');

console.log('\n=== booking ===');
const book = (uid, sid, start, min = 60, weeks = 1) => q(uid, `select id, starts_at from public.book_lesson($1,$2::timestamptz,$3,$4)`, [sid, start, min, weeks]);
const b1 = (await book(L, rel, `${day(0)}T12:00:00Z`)).rows;
ok(b1.length === 1, 'learner books a single lesson inside availability');
ok(!(await slots(L, rel, day(0), 'America/Sao_Paulo')).includes(`${day(0)}T12:00:00.000Z`), 'that slot is no longer offered');
ok(await fails(() => book(L2, relOther, `${day(0)}T12:30:00Z`), /DOUBLE_BOOKING_TEACHER/), 'another learner cannot book an overlapping moment (teacher busy)');
ok(await fails(() => book(L, rel, `${day(0)}T15:30:00Z`), /NOT_AVAILABLE/), 'in the gap between two blocks (12:30 SP) is refused');
ok(await fails(() => book(L, rel, `${day(0)}T14:30:00Z`), /NOT_AVAILABLE/), 'a lesson that runs past the end of a block (11:30–12:30 SP) is refused');
ok(await fails(() => book(L, rel, `${day(1)}T12:00:00Z`), /NOT_AVAILABLE/), 'a day without availability is refused');
ok(await fails(() => book(L2, rel, `${day(0)}T17:00:00Z`), /Not authorized/), 'nobody can book for someone else\'s relation');
ok(await fails(() => book(L, rel, new Date(Date.now() + 10 * 60e3).toISOString()), /TOO_SOON|NOT_AVAILABLE/), 'not in the past / within the hour');
// my own lesson as teacher blocks my booking as learner (across roles)
await q(L, `select public.schedule_lessons($1,$2::timestamp,'UTC',60,1)`, [myStudent, `${day(0)} 17:00`]);
ok(await fails(() => book(L, rel, `${day(0)}T17:00:00Z`), /DOUBLE_BOOKING_STUDENT/), 'I cannot book a lesson while I give a lesson myself');
ok(!(await slots(L, rel, day(0), 'UTC')).includes(`${day(0)}T17:00:00.000Z`), 'and that moment is not offered to me');

console.log('\n=== time blocks (holiday / private) ===');
await q(T, `insert into public.personal_events(title,kind,starts_at,ends_at,timezone) values ('Vakantie','block',$1::date,$1::date + 14,'America/Sao_Paulo')`, [day(7)]);
ok((await slots(L, rel, day(7), 'America/Sao_Paulo')).length === 0 && (await slots(L, rel, day(9), 'America/Sao_Paulo')).length === 0, 'a 2-week holiday block hides all slots');
ok(await fails(() => book(L, rel, `${day(0)}T14:00:00Z`, 60, 3), /DOUBLE_BOOKING_PERSONAL/), 'a weekly booking that hits the holiday is refused completely');
ok((await pg.query(`select count(*)::int n from public.lessons where student_id=$1`, [rel])).rows[0].n === 1, 'all-or-nothing: no partial series');
ok(await fails(() => q(T, `insert into public.personal_events(title,kind,starts_at,ends_at) values ('x','personal',now(),now() + interval '3 days')`), /personal_events_length/), 'a normal appointment still lasts at most 24 hours');
ok((await q(L, `select count(*)::int n from public.personal_events`)).rows[0].n === 0, 'a learner never sees the teacher\'s blocks');

console.log('\n=== weekly booking, DST ===');
await q(T, `select public.save_availability('Europe/Amsterdam','[{"weekday":7,"start":"10:00","end":"12:00"}]')`);
const wk = (await book(L, rel, '2027-03-21T09:00:00Z', 60, 2)).rows.map(r => new Date(r.starts_at).toISOString());
ok(wk[0] === '2027-03-21T09:00:00.000Z' && wk[1] === '2027-03-28T08:00:00.000Z', 'weekly: same Amsterdam wall time (10:00) across the summer-time change');
ok((await pg.query(`select count(distinct series_id)::int n, bool_and(created_via='booking_link') b, bool_and(created_by=$1) c from public.lessons where starts_at >= '2027-03-20'`, [L])).rows[0].n === 1, 'one series, marked as booked by the learner');
ok((await q(T, `select count(*)::int n from public.lessons where starts_at >= '2027-03-20'`)).rows[0].n === 2, 'the teacher sees the booked lessons');
ok(await fails(() => book(L, rel, '2027-04-04T09:00:00Z', 60, 13), /Invalid number of weeks/), 'at most 12 weeks at once');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
