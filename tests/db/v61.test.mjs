// v61: payment administration — payment status, agreed price, packages (no double debit), no-shows, access.
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql', 'v43.sql', 'v44.sql', 'v45.sql', 'v47.sql', 'v48.sql', 'v52.sql', 'v56.sql', 'v57.sql', 'v58.sql', 'v59.sql', 'v60.sql']) await pg.exec(sql(f));
const T = '00000000-0000-0000-0000-0000000000d1', T2 = '00000000-0000-0000-0000-0000000000d2', L = '00000000-0000-0000-0000-0000000000d3', L2 = '00000000-0000-0000-0000-0000000000d4';
await pg.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${T}','t@x.nl',now()),('${T2}','t2@x.nl',now()),('${L}','l@x.nl',now()),('${L2}','l2@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T}','t@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${L}','l@x.nl','student'),('${L2}','l2@x.nl','student') on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const fails = async (fn, re) => { try { await fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const st = async (teacher, user) => (await pg.query(`insert into public.students(teacher_id,email,name,curriculum_subject,user_id) values ($1,gen_random_uuid()::text||'@x.nl','S','nl',$2) returning id`, [teacher, user])).rows[0].id;
const s1 = await st(T, L), s2 = await st(T, L2), sOther = await st(T2, L2);
const plan = async (sid, local, uid = T) => (await q(uid, `select id from public.schedule_lessons($1,$2::timestamp,'Europe/Amsterdam',60,1)`, [sid, local])).rows[0].id;
const lesson = async id => (await pg.query(`select * from public.lessons where id=$1`, [id])).rows[0];

const old = await plan(s1, '2026-12-01 10:00');                       // a lesson from BEFORE v61
await pg.exec(sql('v61.sql')); await pg.exec(sql('v61.sql'));
ok(true, 'v61 runs (twice → idempotent)');
ok((await lesson(old)).payment_status === null, 'existing lessons stay "unknown" — never assumed unpaid');

console.log('\n=== tariff and payment status ===');
let l1 = await plan(s1, '2026-12-02 10:00');
ok((await lesson(l1)).payment_status === null, 'billing off (default) → no payment status on new lessons');
await q(T, `select public.set_billing_enabled(true)`);
ok(await fails(() => q(L, `select public.set_billing_enabled(true)`), /Not authorized/), 'only teachers switch billing on');
await q(T, `insert into public.student_billing(student_id,price_cents,currency,mode) values ($1,3500,'EUR','lesson')`, [s1]);
l1 = await plan(s1, '2026-12-03 10:00');
let r = await lesson(l1);
ok(r.payment_status === 'open' && r.price_cents === 3500 && r.currency === 'EUR', 'new lesson: status open, agreed price copied');
await q(T, `update public.student_billing set price_cents=4000 where student_id=$1`, [s1]);
ok((await lesson(l1)).price_cents === 3500 && (await lesson(await plan(s1, '2026-12-04 10:00'))).price_cents === 4000, 'a price change does not alter earlier lessons');
ok(await fails(() => q(L, `select public.set_payment($1,'paid')`, [l1]), /Not authorized/), 'the learner cannot mark a lesson as paid');
await q(L, `select public.report_payment($1)`, [l1]);
r = await lesson(l1);
ok(r.payment_status === 'reported' && r.payment_reported_at, 'the learner can report "Ik heb betaald"');
ok(await fails(() => q(L, `update public.lessons set payment_status='paid' where id=$1 returning id`, [l1]).then(x => { if (!x.rows.length) throw new Error('none'); }), /none|denied|policy/i), 'and cannot change the status directly');
await q(T, `select public.set_payment($1,'paid')`, [l1]);
r = await lesson(l1);
ok(r.payment_status === 'paid' && r.payment_confirmed_by === T && r.payment_confirmed_at, 'the teacher confirms: who and when are stored');
await q(T, `select public.set_payment($1,'open')`, [l1]);
ok((await lesson(l1)).payment_status === 'open' && !(await lesson(l1)).payment_confirmed_by, 'the teacher can undo it');
ok(await fails(() => q(T2, `select public.set_payment($1,'paid')`, [l1]), /Not authorized/), 'another teacher cannot touch it');

console.log('\n=== lesson status is separate from payment ===');
await q(T, `update public.lessons set status='no_show_student' where id=$1`, [l1]);
r = await lesson(l1);
ok(r.status === 'no_show_student' && r.payment_status === 'open', '"leerling niet verschenen" keeps its own payment status');
await q(T, `update public.lessons set status='cancelled' where id=$1`, [l1]);
ok((await lesson(l1)).payment_status === 'open', 'cancelled is not automatically unpaid or paid');
ok(await fails(() => q(T, `update public.lessons set status='bogus' where id=$1`, [l1]), /lessons_status_check/), 'only known lesson statuses');

console.log('\n=== packages ===');
await q(T, `insert into public.student_billing(student_id,price_cents,currency,mode) values ($1,null,'EUR','package')`, [s2]);
await q(T, `insert into public.lesson_packages(student_id,lessons_total,price_cents,currency,paid_at) values ($1,4,12000,'EUR',now())`, [s2]);
const bal = async uid => (await q(uid, `select * from public.package_balance($1)`, [s2])).rows[0];
const p1 = await plan(s2, '2026-12-05 10:00'), p2 = await plan(s2, '2026-12-06 10:00'), p3 = await plan(s2, '2026-12-07 10:00');
ok((await lesson(p1)).payment_status === 'na', 'package student: lessons are covered by the package (na)');
await q(T, `update public.lessons set status='completed' where id=$1`, [p1]);
ok((await bal(T)).used === 1 && (await bal(T)).remaining === 3, 'a completed lesson uses one lesson of the package');
await q(T, `update public.lessons set status='scheduled' where id=$1`, [p1]); await q(T, `update public.lessons set status='completed' where id=$1`, [p1]);
ok((await bal(T)).used === 1, 'completing the same lesson again never debits twice');
await pg.query(`insert into public.lesson_sessions(student_id,teacher_id,session_key,lesson_date,started_at,ended_at,joint_seconds,lesson_id) values ($1,$2,'session-k1','2026-12-06',now(),now(),0,$3)`, [s2, T, p2]);
await pg.query(`update public.lesson_sessions set registered_at=now(), joint_seconds=1500 where session_key='session-k1'`);
ok((await lesson(p2)).status === 'completed' && (await bal(T)).used === 2, 'a lesson that really took place (registered session) is completed and debited');
await q(T, `update public.lessons set status='cancelled' where id=$1`, [p3]);
ok((await bal(T)).used === 2, 'a cancelled lesson is NOT debited automatically');
ok(await q(T, `select public.package_debit($1,true) d`, [p3]).then(x => x.rows[0].d) && (await bal(T)).used === 3, 'only when the teacher confirms (cancellation rules)');
ok(!(await q(T, `select public.package_debit($1,true) d`, [p3])).rows[0].d && (await bal(T)).used === 3, 'confirming twice still debits once');
await q(T, `select public.package_debit($1,false)`, [p3]);
ok((await bal(T)).used === 2, 'the teacher can undo a debit');
ok((await bal(L2)).remaining === 2, 'the learner sees the remaining lessons');
ok(await fails(() => q(L2, `select public.package_debit($1,true)`, [p3]), /Not authorized/), 'the learner cannot debit');
ok(await fails(() => q(T, `insert into public.lesson_package_uses(lesson_id,package_id) values ($1,(select id from public.lesson_packages limit 1))`, [p3]), /permission|denied|row-level security/i), 'uses only through the functions');

console.log('\n=== privacy ===');
ok((await q(L2, `select count(*)::int n from public.student_billing`)).rows[0].n === 1 && (await q(L, `select count(*)::int n from public.lesson_packages`)).rows[0].n === 0, 'learners see only their own tariff and packages');
ok((await q(T2, `select count(*)::int n from public.student_billing`)).rows[0].n === 0 && (await q(T2, `select count(*)::int n from public.package_balance($1)`, [s2])).rows[0].n === 0, 'another teacher sees nothing');
ok(!(await pg.query(`select prosrc from pg_proc where proname in ('gcal_outbox','gcal_extra_plan')`)).rows.some(x => /payment|price_cents/.test(x.prosrc)), 'nothing financial goes to Google Calendar');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
