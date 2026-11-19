// v43: automatic lesson registration from real joint presence (PGlite, real RLS).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql']) await pg.exec(sql(f));

const T1 = '00000000-0000-0000-0000-0000000000f1', T2 = '00000000-0000-0000-0000-0000000000f2', S = '00000000-0000-0000-0000-0000000000f3', S2 = '00000000-0000-0000-0000-0000000000f4';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${T1}','t1@x.nl',now()),('${T2}','t2@x.nl',now()),('${S}','s@x.nl',now()),('${S2}','s2@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T1}','t1@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${S}','s@x.nl','student'),('${S2}','s2@x.nl','student')
   on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { const r = await q(uid, text, params); return {ok: true, rows: r.rows}; } catch (e) { return {ok: false, error: e.message}; } };

const R1 = (await q(T1, `insert into public.students(teacher_id,email,name,curriculum_subject,level) values ($1,'s@x.nl','Sofia','pt','A2') returning id`, [T1])).rows[0].id;
const R2 = (await q(T1, `insert into public.students(teacher_id,email,name,curriculum_subject,level) values ($1,'s2@x.nl','Pedro','nl','B1') returning id`, [T1])).rows[0].id;
const NOACC = (await q(T1, `insert into public.students(teacher_id,email,name) values ($1,'x@x.nl','Zonder account') returning id`, [T1])).rows[0].id;
for (const [u, r] of [[S, R1], [S2, R2]]) await q(u, `select public.accept_student_link($1)`, [r]);
await pg.query(`insert into public.lesson_entries(student_id,lesson_date,notes) values ($1,'2026-10-01','oud')`, [R1]);

console.log('\n=== v43 migration ===');
await pg.exec(sql('v43.sql')); await pg.exec(sql('v43.sql'));
ok(true, 'v43 runs (twice → idempotent)');
ok((await pg.query(`select count(*)::int n from public.lesson_entries`)).rows[0].n === 1, 'existing lesson data untouched');

const beat = (uid, sid, key, joint, planned = null) => tryq(uid, `select public.lesson_presence($1,$2,$3,$4) r`, [sid, key, joint, planned]).then(x => x.ok ? {ok: true, ...x.rows[0].r} : x);
const registered = async sid => (await pg.query(`select count(*)::int n from public.lesson_sessions where student_id=$1 and registered_at is not null`, [sid])).rows[0].n;
const rows = async sid => (await pg.query(`select count(*)::int n from public.lesson_sessions where student_id=$1`, [sid])).rows[0].n;
// simulate time passing: move the session start back (wall-clock cap = started_at)
const age = (sid, key, secs) => pg.query(`update public.lesson_sessions set started_at = started_at - make_interval(secs => $3) where student_id=$1 and session_key=$2`, [sid, key, secs]);

console.log('\n=== registration only after joint presence ≥ threshold ===');
ok((await q(T1, `select public.lesson_min_joint_seconds() n`)).rows[0].n === 120, 'threshold: 2 minutes (one function, configurable)');
let r = await beat(T1, R1, 'sessAAAA1111', 30);
ok(r.ok && r.registered === false && r.threshold === 120, 'first heartbeat: session exists, not yet a lesson');
ok(await registered(R1) === 0, 'below the threshold nothing counts');
r = await beat(T1, R1, 'sessAAAA1111', 9999);
ok(r.ok && r.joint_seconds <= 120 && r.registered === false, 'joint time can never exceed wall-clock time (inflated value capped)');
await age(R1, 'sessAAAA1111', 150);
r = await beat(T1, R1, 'sessAAAA1111', 125);
ok(r.ok && r.registered === true && r.joint_seconds === 125, 'after 2 minutes together: registered');
ok(await registered(R1) === 1, 'exactly one lesson');

console.log('\n=== refresh / reconnect / a second lesson ===');
await age(R1, 'sessAAAA1111', 300);
r = await beat(T1, R1, 'sessAAAA1111', 100);
ok(r.ok && r.joint_seconds === 125, 'refresh with a lower counter never lowers the joint time');
r = await beat(T1, R1, 'sessAAAA1111', 400);
ok(r.ok && await registered(R1) === 1 && await rows(R1) === 1, 'refresh / reconnect within the grace period: same lesson, no duplicate');
await pg.query(`update public.lesson_sessions set ended_at = now() - interval '20 minutes' where session_key='sessAAAA1111'`);
r = await beat(T1, R1, 'sessAAAA1111', 500);
ok(!r.ok && /SESSION_EXPIRED/.test(r.error), 'after the grace period the old session is closed (the classroom starts a new one)');
r = await beat(T1, R1, 'sessBBBB2222', 60); await age(R1, 'sessBBBB2222', 200); r = await beat(T1, R1, 'sessBBBB2222', 180);
ok(r.ok && r.registered && await registered(R1) === 2, 'a separately started lesson on the same day counts as a new lesson');
r = await beat(T1, R1, 'sessCCCC3333', 50);
ok(r.ok && await registered(R1) === 2, 'a short session (teacher waited, student left after 50 s) does not count');

console.log('\n=== who may register and read ===');
ok(!(await beat(T2, R1, 'sessDDDD4444', 30)).ok, 'another teacher cannot register a lesson for this relation');
ok(!(await beat(S, R1, 'sessEEEE5555', 30)).ok, 'the student cannot write sessions (teacher device measures presence)');
ok(!(await tryq(T1, `insert into public.lesson_sessions(student_id,teacher_id,session_key,lesson_date,joint_seconds,registered_at) values ($1,$2,'sessFFFF6666',current_date,999,now())`, [R1, T1])).ok, 'no direct inserts: only through the checked heartbeat');
ok(!(await tryq(T1, `update public.lesson_sessions set joint_seconds = 9999`)).ok || (await pg.query(`select max(joint_seconds) m from public.lesson_sessions`)).rows[0].m < 9999, 'no direct updates');
r = await beat(T1, NOACC, 'sessGGGG7777', 30);
ok(!r.ok && /NO_STUDENT_ACCOUNT/.test(r.error), 'no lesson without a linked student');
ok(!(await beat(T1, R1, 'bad key!', 30)).ok, 'invalid session key refused');
ok((await q(S, `select * from public.lesson_sessions`)).rows.length === 3, 'the linked student reads their own sessions');
ok((await q(S2, `select * from public.lesson_sessions`)).rows.length === 0, 'another student sees nothing');
ok((await q(T2, `select * from public.lesson_sessions`)).rows.length === 0, 'another teacher sees nothing');

console.log('\n=== planned lessons and recordings ===');
const L = (await q(T1, `insert into public.lessons(student_id,teacher_id,starts_at,ends_at) values ($1,$2,now() - interval '5 minutes',now() + interval '55 minutes') returning id`, [R2, T1])).rows[0].id;
r = await beat(T1, R2, 'sessHHHH8888', 20);
ok(r.ok && r.lesson_id === L, 'a planned lesson around now is linked automatically');
ok((await pg.query(`select language from public.lesson_sessions where session_key='sessHHHH8888'`)).rows[0].language === 'nl', 'language of the relation stored');
r = await beat(T1, R1, 'sessIIII9999', 20, L);
ok(r.ok && r.lesson_id === null, 'a planned lesson of ANOTHER relation is never linked');
const rec = (await q(T1, `insert into public.lesson_recordings(student_id,storage_path,teacher_consent_at,student_consent_at,created_by) values ($1,$2,now(),now(),$3) returning id`, [R2, `${R2}/rec.webm`, T1])).rows[0].id;
ok((await pg.query(`select recording_id from public.lesson_sessions where session_key='sessHHHH8888'`)).rows[0].recording_id === rec, 'a recording made during the session is linked to it');
ok((await pg.query(`select count(*)::int n from public.lesson_sessions where recording_id is null and registered_at is not null`)).rows[0].n === 2, 'lessons without a recording stay registered (recording optional)');

console.log('\n=== unlinking keeps the data ===');
await q(S, `select public.student_leave_teacher($1)`, [R1]);
ok((await q(S, `select * from public.lesson_sessions where student_id=$1`, [R1])).rows.length === 0, 'after the student unlinks they no longer see the sessions');
ok((await q(T1, `select * from public.lesson_sessions where student_id=$1`, [R1])).rows.length === 4, 'the teacher keeps all registered lessons (nothing deleted)');
ok(!(await beat(T1, R1, 'sessJJJJ0000', 30)).ok, 'no new lessons for an unlinked relation');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
