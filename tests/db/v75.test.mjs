// v75: practice_questions + daily_runs — RLS: own student and own teacher only; one run per relation and day.
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v64.sql', 'v68.sql']) await pg.exec(sql(f));
await pg.exec(sql('v75.sql')); await pg.exec(sql('v75.sql'));
ok(true, 'v75 runs twice (idempotent)');
const T = '00000000-0000-0000-0000-0000000000d1', T2 = '00000000-0000-0000-0000-0000000000d2', U = '00000000-0000-0000-0000-0000000000d3', U2 = '00000000-0000-0000-0000-0000000000d4';
await pg.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${T}','t@x.nl',now()),('${T2}','t2@x.nl',now()),('${U}','u@x.nl',now()),('${U2}','u2@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T}','t@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${U}','u@x.nl','student'),('${U2}','u2@x.nl','student') on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tries = async (uid, text, params) => { try { const r = await q(uid, text, params); return r.affectedRows ?? r.rows.length ?? 1; } catch { return -1; } };
const s1 = (await pg.query(`insert into public.students(teacher_id,user_id,email,name,curriculum_subject) values ($1,$2,'u@x.nl','S','pt') returning id`, [T, U])).rows[0].id;
const P = `{"kind":"mc","prompt":"Os dois quartos têm ___ tamanho.","options":["a mesma","o mesmo","as mesmas","os mesmos"],"answer":"o mesmo","accept":[],"explanation":"x","example":"y","instruction":"z"}`;

ok(await tries(U, `insert into public.practice_questions(student_id,lang,topic,source,payload) values ($1,'pt','Geslacht','error',$2)`, [s1, P]) === 1, 'the student stores a validated question for the own relation');
ok(await tries(T, `insert into public.practice_questions(student_id,lang,topic,source,payload) values ($1,'pt','Ser/estar','topic',$2)`, [s1, P]) === 1, 'the teacher too');
ok(await tries(U2, `insert into public.practice_questions(student_id,lang,topic,source,payload) values ($1,'pt','x','topic',$2)`, [s1, P]) === -1, 'another student cannot write for this relation');
ok(await tries(U, `insert into public.practice_questions(student_id,lang,topic,source,payload) values ($1,'pt','x','other',$2)`, [s1, P]) === -1, 'source is checked');
ok((await q(U2, `select * from public.practice_questions where student_id=$1`, [s1])).rows.length === 0, 'another student sees nothing');
ok((await q(T2, `select * from public.practice_questions where student_id=$1`, [s1])).rows.length === 0, 'another teacher sees nothing');
ok((await q(U, `select * from public.practice_questions where student_id=$1`, [s1])).rows.length === 2, 'the student sees the own bank');
ok(await tries(U, `update public.practice_questions set used_on='2026-11-26', times_used=times_used+1 where student_id=$1`, [s1]) === 2, 'marking questions as used');

ok(await tries(U, `insert into public.daily_runs(student_id,day,questions) values ($1,'2026-11-26','[]')`, [s1]) === 1, 'the student freezes today\'s set');
ok(await tries(U, `insert into public.daily_runs(student_id,day,questions) values ($1,'2026-11-26','[]')`, [s1]) === -1, 'one run per relation and day');
ok(await tries(T, `insert into public.daily_runs(student_id,day,questions) values ($1,'2026-11-27','[]')`, [s1]) === -1, 'the teacher does not do the student\'s daily challenge');
ok(await tries(U, `update public.daily_runs set answers='[{"ok":true}]', finished_at=now() where student_id=$1`, [s1]) === 1, 'answers saved, finished once');
ok((await q(T, `select * from public.daily_runs where student_id=$1`, [s1])).rows.length === 1, 'the teacher can read the results');
ok((await q(U2, `select * from public.daily_runs where student_id=$1`, [s1])).rows.length === 0, 'another student cannot');
ok(await tries(U2, `update public.daily_runs set answers='[]' where student_id=$1`, [s1]) === 0, 'another student cannot change them');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
