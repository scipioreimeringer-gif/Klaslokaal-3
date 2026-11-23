// v57: central agenda for one account with several roles (admin + teacher + learner) — availability across roles,
// personal appointments, Google Calendar with an explicit choice of what is synchronised (no duplicates), tasks.
// Mirrors scipio.reimeringer@gmail.com: teaches Madison (Dutch), follows Portuguese with Esther, is admin.
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql', 'v43.sql', 'v44.sql', 'v45.sql', 'v47.sql', 'v48.sql', 'v52.sql', 'v56.sql']) await pg.exec(sql(f));

const ME = '00000000-0000-0000-0000-0000000000f1', MAD = '00000000-0000-0000-0000-0000000000f2', EST = '00000000-0000-0000-0000-0000000000f3', OLD = '00000000-0000-0000-0000-0000000000f4', X = '00000000-0000-0000-0000-0000000000f5';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${ME}','scipio.reimeringer@gmail.com',now()),('${MAD}','madison@x.nl',now()),('${EST}','esther@x.nl',now()),('${OLD}','old.teacher@x.nl',now()),('${X}','x.teacher@x.nl',now());
  insert into public.profiles(id,email,role,full_name) values ('${ME}','scipio.reimeringer@gmail.com','admin','Scipio'),('${MAD}','madison@x.nl','student','Madison'),('${EST}','esther@x.nl','teacher','Esther'),('${OLD}','old.teacher@x.nl','teacher','Old'),('${X}','x.teacher@x.nl','teacher','X')
   on conflict (id) do update set role=excluded.role, full_name=excluded.full_name;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const st = async (teacher, email, subj, user, name) => (await pg.query(`insert into public.students(teacher_id,email,name,curriculum_subject,level,user_id) values ($1,$2,$3,$4,'A2',$5) returning id`, [teacher, email, name, subj, user])).rows[0].id;
const madison = await st(ME, 'madison@x.nl', 'nl', MAD, 'Madison');      // I teach Madison
const myPt = await st(EST, 'scipio.reimeringer@gmail.com', 'pt', ME, 'Scipio'); // I follow Portuguese with Esther
const self = await st(ME, 'scipio.reimeringer@gmail.com', 'nl', ME, 'Scip test'); // own test profile (teacher = learner)
const other = await st(X, 'z@x.nl', 'nl', null, 'Z');                      // someone else's student (admin must not see it in the agenda)
const plan = async (uid, sid, local, min = 60) => q(uid, `select id from public.schedule_lessons($1,$2::timestamp,'Europe/Amsterdam',$3,1)`, [sid, local, min]);
const fails = async (fn, re) => { try { await fn(); return false; } catch (e) { return re.test(String(e.message)); } };

// an EXISTING teacher connection from before v57 (another teacher) — must keep working unchanged
await q(OLD, `select public.gcal_connect('old@gmail.com','v1:OLD')`);
await q(OLD, `select public.gcal_choose_calendar('old-cal','Old calendar')`);

console.log('\n=== v57 migration ===');
await pg.exec(sql('v57.sql')); await pg.exec(sql('v57.sql'));
ok(true, 'v57 runs (twice → idempotent)');
const oldC = (await pg.query(`select sync_teaching, sync_learning, sync_personal, sync_confirmed_at from public.calendar_connections where teacher_id='${OLD}'`)).rows[0];
ok(oldC.sync_teaching && !oldC.sync_learning && !oldC.sync_personal && oldC.sync_confirmed_at, 'existing connection keeps its behaviour (lessons I give, already confirmed)');

console.log('\n=== lessons in all roles ===');
const teach = (await plan(ME, madison, '2026-12-07 14:00')).rows[0].id;            // Dutch lesson I give at 14:00
const learn = (await plan(EST, myPt, '2026-12-07 17:00')).rows[0].id;              // Portuguese lesson I follow at 17:00
const selfL = (await plan(ME, self, '2026-12-08 09:00')).rows[0].id;
await plan(X, other, '2026-12-07 12:00');
const mine = (await q(ME, `select l.id from public.lessons l left join public.students s on s.id=l.student_id where l.teacher_id=$1 or s.user_id=$1`, [ME])).rows.map(r => r.id);
ok(mine.includes(teach) && mine.includes(learn) && mine.includes(selfL) && mine.length === 3, 'my lessons as teacher AND as learner, each once (by lesson id)');

console.log('\n=== availability across roles ===');
ok(await fails(() => plan(ME, madison, '2026-12-07 17:30'), /DOUBLE_BOOKING_TEACHER/), 'I cannot plan a lesson while I follow a lesson myself');
ok(await fails(() => plan(EST, myPt, '2026-12-07 14:30'), /DOUBLE_BOOKING_STUDENT/), 'my teacher cannot plan my lesson while I give a lesson');
ok(await fails(() => plan(ME, madison, '2026-12-07 16:30'), /DOUBLE_BOOKING_TEACHER/), 'overlap at the edge (16:30–17:30 vs 17:00) is caught');
ok((await plan(ME, madison, '2026-12-07 18:00')).rows.length === 1, 'right after my own lesson is fine');
const pe = (await q(ME, `insert into public.personal_events(title,starts_at,ends_at,timezone) values ('Tandarts','2026-12-09 10:00+01','2026-12-09 11:00+01','Europe/Amsterdam') returning id`)).rows[0].id;
ok(await fails(() => plan(ME, madison, '2026-12-09 10:30'), /DOUBLE_BOOKING_PERSONAL/), 'a personal appointment blocks planning');
await q(ME, `insert into public.personal_events(title,starts_at,ends_at,blocks_lessons) values ('Lunch (vrij)','2026-12-09 12:00+01','2026-12-09 13:00+01',false)`);
ok((await plan(ME, madison, '2026-12-09 12:00')).rows.length === 1, 'an appointment marked "not busy" does not block');
ok((await plan(EST, myPt, '2026-12-09 10:00')).rows.length === 1, 'my personal appointments are private: they never block (or reveal anything to) another teacher');
await pg.exec(`delete from public.lessons where student_id='${myPt}' and starts_at='2026-12-09 10:00+01'`);
ok((await q(MAD, `select count(*)::int n from public.personal_events`)).rows[0].n === 0 && (await q(EST, `select count(*)::int n from public.personal_events`)).rows[0].n === 0, 'personal appointments: nobody else can read them (RLS)');
ok(await fails(() => q(MAD, `update public.personal_events set title='x' where id=$1 returning id`, [pe]).then(r => { if (!r.rows.length) throw new Error('none'); }), /none/), 'nor change them');

console.log('\n=== Google Calendar: explicit choice, no duplicates ===');
await q(ME, `select public.gcal_connect('mijn.eigen@gmail.com','v1:ME')`);
let s = (await q(ME, `select public.gcal_status() s`)).rows[0].s;
ok(s.connected && s.confirmed === false && s.email === 'mijn.eigen@gmail.com', 'a new connection starts UNCONFIRMED and shows the account');
await q(ME, `select public.gcal_choose_calendar('mijn-cal','Mijn agenda')`);
const ob0 = (await pg.query(`select count(*)::int n from public.calendar_outbox where teacher_id='${ME}'`)).rows[0].n;
const plan0 = (await q(ME, `select public.gcal_extra_plan() p`)).rows[0].p;
ok(ob0 === 0 && plan0.want.length === 0, 'choosing a calendar sends NOTHING before consent');
await plan(ME, madison, '2026-12-10 09:00');
ok((await pg.query(`select count(*)::int n from public.calendar_outbox where teacher_id='${ME}'`)).rows[0].n === 0, 'new lessons are not queued before consent either');
await q(ME, `select public.gcal_set_types(true,true,false)`);
s = (await q(ME, `select public.gcal_status() s`)).rows[0].s;
ok(s.confirmed && s.sync_teaching && s.sync_learning && !s.sync_personal && s.calendar_name === 'Mijn agenda', 'consent stored with the chosen types and target calendar');
const ob = (await q(ME, `select public.gcal_outbox(100) o`)).rows[0].o;
ok(ob.length > 0 && ob.every(r => r.op === 'upsert') && ob.some(r => r.lesson_id === teach) && !ob.some(r => r.lesson_id === learn), 'lessons I give go through the two-way queue (not the lesson I follow)');
let p = (await q(ME, `select public.gcal_extra_plan() p`)).rows[0].p;
ok(p.want.length === 1 && p.want[0].item_id === learn && p.want[0].kind === 'learn' && p.want[0].teacher_name === 'Esther', 'the lesson I follow goes one way, with the teacher name');
ok(!p.want.some(w => w.item_id === selfL) && ob.some(r => r.lesson_id === selfL), 'own test lesson (teacher = learner) is sent ONCE (as a lesson I give)');
ok(!p.want.some(w => w.kind === 'personal'), 'personal appointments are not sent unless chosen');
await q(ME, `select public.gcal_extra_done('learn',$1,'trsx1','fp1',false)`, [learn]);
await q(ME, `select public.gcal_extra_done('learn',$1,'trsx1','fp1',false)`, [learn]);
ok((await pg.query(`select count(*)::int n from public.calendar_extra_links where user_id='${ME}'`)).rows[0].n === 1, 'repeated sync → still one link per lesson (no duplicate event)');
p = (await q(ME, `select public.gcal_extra_plan() p`)).rows[0].p;
ok(p.want[0].event_id === 'trsx1' && p.want[0].fingerprint === 'fp1', 'next sync knows the existing event (update, never a second create)');
ok(!(await q(MAD, `select public.gcal_extra_done('learn',$1,'evil','x',false)`, [learn]).then(() => pg.query(`select 1 from public.calendar_extra_links where user_id='${MAD}'`))).rows.length, 'nobody can link a lesson that is not theirs');
await q(ME, `select public.gcal_set_types(true,true,true)`);
p = (await q(ME, `select public.gcal_extra_plan() p`)).rows[0].p;
ok(p.want.filter(w => w.kind === 'personal').length === 2 && p.want.find(w => w.kind === 'personal' && w.title === 'Tandarts'), 'personal appointments only after choosing them');
await pg.exec(`update public.lessons set status='cancelled' where id='${learn}'`);
p = (await q(ME, `select public.gcal_extra_plan() p`)).rows[0].p;
ok(p.remove.some(r => r.item_id === learn && r.event_id === 'trsx1'), 'a cancelled followed lesson is removed from Google');
await pg.exec(`update public.lessons set status='scheduled' where id='${learn}'`);
// links for my given lessons, then switch "lessons I give" off → deletes are queued, links gone
for (const r of (await q(ME, `select public.gcal_outbox(100) o`)).rows[0].o) await q(ME, `select public.gcal_outbox_done($1,$2,now(),null)`, [r.id, 'tr' + r.lesson_id.replace(/-/g, '')]);
await q(ME, `select public.gcal_set_types(false,true,false)`);
const del = (await q(ME, `select public.gcal_outbox(100) o`)).rows[0].o;
ok(del.length > 0 && del.every(r => r.op === 'delete') && (await pg.query(`select count(*)::int n from public.calendar_links where teacher_id='${ME}'`)).rows[0].n === 0, 'switching "lessons I give" off removes those events (queued deletes)');
await plan(ME, madison, '2026-12-11 09:00');
ok(!(await q(ME, `select public.gcal_outbox(100) o`)).rows[0].o.some(r => r.op === 'upsert'), 'and new given lessons are not sent any more');
p = (await q(ME, `select public.gcal_extra_plan() p`)).rows[0].p;
ok(!p.want.some(w => w.kind === 'personal') && (p.remove.length === 0 || p.remove.every(r => r.item_id !== learn)), 'personal switched off again; the followed lesson stays');
await q(ME, `select public.gcal_connect('ander.account@gmail.com','v1:NEW')`);
s = (await q(ME, `select public.gcal_status() s`)).rows[0].s;
ok(s.confirmed === false && !s.calendar_id && (await pg.query(`select count(*)::int n from public.calendar_extra_links where user_id='${ME}'`)).rows[0].n === 0, 'another Google account never reuses the previous calendar, links or consent');
await q(ME, `select public.gcal_disconnect()`);
ok(!(await q(ME, `select public.gcal_status() s`)).rows[0].s.connected && (await pg.query(`select count(*)::int n from public.lessons`)).rows[0].n > 0, 'disconnect removes the connection, never lessons');
// a learner without a teacher role can connect too, but can never switch on "lessons I give"
await q(MAD, `select public.gcal_connect('madison@gmail.com','v1:MAD')`);
await q(MAD, `select public.gcal_choose_calendar('mad-cal','Madison')`);
await q(MAD, `select public.gcal_set_types(true,true,false)`);
s = (await q(MAD, `select public.gcal_status() s`)).rows[0].s;
ok(s.connected && s.sync_teaching === false && s.sync_learning === true && s.is_teacher === false, 'a learner can connect; "lessons I give" stays off');
ok((await q(MAD, `select public.gcal_extra_plan() p`)).rows[0].p.want.every(w => w.kind === 'learn'), 'and only gets own lessons');
ok(!(await q(MAD, `select public.gcal_status() s`)).rows[0].s.email.includes('scipio'), 'connections are strictly per account');
ok(await fails(() => q(EST, `select public.gcal_set_types(true,true,true)`), /Not connected/), 'no connection → nothing can be set');

console.log('\n=== admin stays separate ===');
const adminSees = (await q(ME, `select count(*)::int n from public.lessons where student_id=$1`, [other])).rows[0].n;
const agendaSees = (await q(ME, `select count(*)::int n from public.lessons l left join public.students s on s.id=l.student_id where (l.teacher_id=$1 or s.user_id=$1) and l.student_id=$2`, [ME, other])).rows[0].n;
ok(agendaSees === 0, `the agenda query (teacher_id = me OR my learner profile) never includes other people's lessons (admin RLS read: ${adminSees})`);
ok(!(await q(ME, `select public.gcal_extra_plan() p`)).rows[0].p.want.length, 'and nothing of others goes to Google');

console.log('\n=== tasks ===');
const tk = (await q(ME, `insert into public.tasks(title,priority,role) values ('Materiaal voorbereiden','high','teacher') returning id`)).rows[0].id;
ok((await q(MAD, `select count(*)::int n from public.tasks`)).rows[0].n === 0, 'manual tasks are private (RLS)');
ok(await fails(() => q(MAD, `insert into public.tasks(owner_id,title) values ($1,'x')`, [ME]), /row-level security|policy/i), 'nobody can create a task for someone else');
await q(ME, `insert into public.task_dismissals(task_key) values ('review:abc')`);
ok(await fails(() => q(ME, `insert into public.task_dismissals(task_key) values ('review:abc')`), /duplicate|unique/i), 'a dismissal is stored once per key');
await q(ME, `update public.tasks set done_at=now() where id=$1`, [tk]);
ok((await q(ME, `select done_at is not null d from public.tasks where id=$1`, [tk])).rows[0].d, 'a task can be completed');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
