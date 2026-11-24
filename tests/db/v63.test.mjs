// v63: register payments (several lessons, optional amount), credit in lessons, corrections, learner history, access.
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql', 'v43.sql', 'v44.sql', 'v45.sql', 'v47.sql', 'v48.sql', 'v52.sql', 'v56.sql', 'v57.sql', 'v58.sql', 'v59.sql', 'v60.sql', 'v61.sql']) await pg.exec(sql(f));
await pg.exec(sql('v63.sql')); await pg.exec(sql('v63.sql'));
ok(true, 'v63 runs (twice → idempotent)');
const T = '00000000-0000-0000-0000-0000000000f7', T2 = '00000000-0000-0000-0000-0000000000f8', L = '00000000-0000-0000-0000-0000000000f9', L2 = '00000000-0000-0000-0000-0000000000fa';
await pg.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${T}','t@x.nl',now()),('${T2}','t2@x.nl',now()),('${L}','l@x.nl',now()),('${L2}','l2@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T}','t@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${L}','l@x.nl','student'),('${L2}','l2@x.nl','student') on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const fails = async (fn, re) => { try { await fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const st = async (teacher, user) => (await pg.query(`insert into public.students(teacher_id,email,name,curriculum_subject,user_id) values ($1,gen_random_uuid()::text||'@x.nl','S','nl',$2) returning id`, [teacher, user])).rows[0].id;
const s1 = await st(T, L), s2 = await st(T, L2);
await q(T, `select public.set_billing_enabled(true)`);
await q(T, `insert into public.student_billing(student_id,price_cents,currency,mode) values ($1,3000,'EUR','lesson')`, [s1]);
const plan = async (sid, local) => (await q(T, `select id from public.schedule_lessons($1,$2::timestamp,'Europe/Amsterdam',60,1)`, [sid, local])).rows[0].id;
const ps = async id => (await pg.query(`select payment_status, payment_record_id from public.lessons where id=$1`, [id])).rows[0];
const a = await plan(s1, '2026-11-02 10:00'), b = await plan(s1, '2026-11-09 10:00'), fut = await plan(s1, '2027-01-04 10:00'), other = await plan(s2, '2026-11-03 10:00');
const reg = (uid, sid, lessons, credit = 0, amount = null) => q(uid, `select public.record_payment($1,$2::uuid[],$3,'EUR','2026-11-20','contant',$4) r`, [sid, lessons, amount, credit]).then(x => x.rows[0].r);

console.log('\n=== register several lessons at once ===');
const r1 = await reg(T, s1, [a, b, fut, other], 0, 9000);
ok((await ps(a)).payment_status === 'paid' && (await ps(b)).payment_status === 'paid' && (await ps(fut)).payment_status === 'paid', 'past lessons and a FUTURE lesson (prepaid) marked paid in one go');
ok((await ps(other)).payment_status !== 'paid', 'a lesson of another student in the selection is ignored');
ok((await ps(a)).payment_record_id === r1, 'each lesson knows its registration');
ok(await fails(() => reg(T, s1, [a, b]), /Already paid/), 'registering already paid lessons again is refused (no double registration)');
ok((await pg.query(`select count(*)::int n from public.payment_records`)).rows[0].n === 1, 'and leaves no empty registration');
ok(await fails(() => reg(L, s1, [a]), /Not authorized/) && await fails(() => reg(T2, s1, [a]), /Not authorized/), 'the learner or another teacher cannot register');

console.log('\n=== credit in lessons ===');
const r2 = await reg(T, s1, [], 3, 9000);
const c = await plan(s1, '2027-01-11 10:00');
ok((await q(T, `select public.use_credit($1) u`, [c])).rows[0].u && (await ps(c)).payment_status === 'paid' && (await ps(c)).payment_record_id === r2, 'credit linked to a lesson planned later → paid, linked to the registration');
ok(!(await q(T, `select public.use_credit($1) u`, [c])).rows[0].u, 'the same lesson never uses credit twice');
const bal = async () => (await q(T, `select sum(remaining)::int r from public.package_balance($1)`, [s1])).rows[0].r;
ok(await bal() === 2, '3 − 1 = 2 lessons of credit left');

console.log('\n=== correction ===');
await q(T, `select public.void_payment($1)`, [r2]);
ok((await ps(c)).payment_status === 'open' && !(await bal()), 'a wrong registration is corrected: lesson open again, credit withdrawn');
ok((await pg.query(`select voided_at is not null v from public.payment_records where id=$1`, [r2])).rows[0].v, 'the registration stays in the history as corrected');

console.log('\n=== learner ===');
const hist = (await q(L, `select * from public.my_payment_history($1)`, [s1])).rows;
ok(hist.length === 2 && hist.some(h => h.lessons === 3) && !('note' in hist[0]), 'the learner sees the own history (without the teacher\'s note)');
ok((await q(L2, `select count(*)::int n from public.my_payment_history($1)`, [s1])).rows[0].n === 0, 'and nobody else\'s');
ok((await q(L, `select count(*)::int n from public.payment_records`)).rows[0].n === 0, 'learners cannot read the registrations table directly');
ok((await q(T2, `select count(*)::int n from public.payment_records`)).rows[0].n === 0, 'another teacher sees nothing');
await q(L, `select public.report_payment($1)`, [c]);
ok((await ps(c)).payment_status === 'reported', 'the learner reports a payment → waits for confirmation');
ok(await fails(() => q(L, `select public.use_credit($1)`, [c]), /Not authorized/), 'the learner cannot use credit or confirm');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
