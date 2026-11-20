// v48: daily practice — spaced repetition for mistakes/homework items, daily sessions, rights (PGlite, real RLS).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql', 'v43.sql', 'v44.sql', 'v45.sql', 'v47.sql']) await pg.exec(sql(f));

const T1 = '00000000-0000-0000-0000-0000000000e1', T2 = '00000000-0000-0000-0000-0000000000e2', S = '00000000-0000-0000-0000-0000000000e3', S2 = '00000000-0000-0000-0000-0000000000e4';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${T1}','t1@x.nl',now()),('${T2}','t2@x.nl',now()),('${S}','s@x.nl',now()),('${S2}','s2@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T1}','t1@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${S}','s@x.nl','student'),('${S2}','s2@x.nl','student')
   on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { const r = await q(uid, text, params); return {ok: true, rows: r.rows}; } catch (e) { return {ok: false, error: e.message}; } };
const R = (await q(T1, `insert into public.students(teacher_id,email,name) values ($1,'s@x.nl','Sofia') returning id`, [T1])).rows[0].id;
const R2 = (await q(T1, `insert into public.students(teacher_id,email,name) values ($1,'s2@x.nl','Pedro') returning id`, [T1])).rows[0].id;
for (const [u, r] of [[S, R], [S2, R2]]) await q(u, `select public.accept_student_link($1)`, [r]);
await pg.query(`insert into public.practice_sessions(student_id,user_id,kind,score,total) values ($1,$2,'quiz',3,5)`, [R, S]);

console.log('\n=== v48 migration ===');
await pg.exec(sql('v48.sql')); await pg.exec(sql('v48.sql'));
ok(true, 'v48 runs (twice → idempotent)');
ok((await pg.query(`select count(*)::int n from public.practice_sessions`)).rows[0].n === 1, 'existing practice results untouched');

console.log('\n=== spaced repetition for mistakes ===');
const rec = (uid, sid, key, correct, kind = 'error', label = 'Woordvolgorde') => tryq(uid, `select public.record_practice_item($1,$2,$3,$4,$5)`, [sid, key, kind, label, correct]);
ok((await rec(S, R, 'err:a1:e_u4_x1', false)).ok, 'the student records a wrong answer on an approved mistake');
let it = (await pg.query(`select * from public.practice_items where item_key='err:a1:e_u4_x1'`)).rows[0];
ok(it.wrong_count === 1 && it.streak === 0 && new Date(it.due_at) - Date.now() < 20 * 60e3, 'wrong → back again soon (~10 min)');
await rec(S, R, 'err:a1:e_u4_x1', true); await rec(S, R, 'err:a1:e_u4_x1', true);
it = (await pg.query(`select * from public.practice_items where item_key='err:a1:e_u4_x1'`)).rows[0];
ok(it.streak === 2 && it.correct_count === 2 && new Date(it.due_at) - Date.now() > 1.5 * 86400e3, 'right twice → comes back after ~2 days (less often)');
ok((await pg.query(`select count(*)::int n from public.practice_items`)).rows[0].n === 1, 'one row per item (no duplicates)');
ok((await rec(S, R, 'hw:as1:3', true, 'homework', '')).ok, 'homework items too');
ok(!(await rec(S, R, 'bad key with spaces', true)).ok, 'invalid key refused');
ok(!(await rec(S2, R, 'err:a1:x', true)).ok, 'another student cannot write in this list');
ok(!(await rec(T2, R, 'err:a1:x', true)).ok, 'another teacher cannot either');
ok(!(await tryq(S, `update public.practice_items set streak = 99`)).ok || (await pg.query(`select max(streak) m from public.practice_items`)).rows[0].m < 99, 'no direct writes');
ok((await q(T1, `select * from public.practice_items where student_id=$1`, [R])).rows.length === 2, 'the teacher sees the practice state');
ok((await q(S2, `select * from public.practice_items`)).rows.length === 0, 'other students see nothing');

console.log('\n=== daily sessions ===');
ok((await tryq(S, `insert into public.practice_sessions(student_id,user_id,kind,score,total,details) values ($1,$2,'daily',8,10,'{"day":"2026-11-20"}')`, [R, S])).ok, 'the student stores a finished daily practice');
ok(!(await tryq(S2, `insert into public.practice_sessions(student_id,user_id,kind,score,total) values ($1,$2,'daily',1,1)`, [R, S2])).ok, 'never for someone else');
ok((await q(T1, `select * from public.practice_sessions where kind='daily'`)).rows.length === 1, 'the teacher sees whether the student practises daily');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
