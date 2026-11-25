// v71: "Graag behandelen" topic requests — RLS (own student asks/withdraws, teacher decides, nobody else), no doubles,
// a request never changes the learning-line status, the student can still not set a status itself.
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v64.sql', 'v68.sql']) await pg.exec(sql(f));
await pg.exec(sql('v71.sql')); await pg.exec(sql('v71.sql'));
ok(true, 'v71 runs twice (idempotent)');
const T = '00000000-0000-0000-0000-0000000000c1', T2 = '00000000-0000-0000-0000-0000000000c2', U = '00000000-0000-0000-0000-0000000000c3', U2 = '00000000-0000-0000-0000-0000000000c4';
await pg.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${T}','t@x.nl',now()),('${T2}','t2@x.nl',now()),('${U}','u@x.nl',now()),('${U2}','u2@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T}','t@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${U}','u@x.nl','student'),('${U2}','u2@x.nl','student') on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tries = async (uid, text, params) => { try { const r = await q(uid, text, params); return r.affectedRows ?? r.rows.length ?? 1; } catch { return -1; } };
const s1 = (await pg.query(`insert into public.students(teacher_id,user_id,email,name,curriculum_subject) values ($1,$2,'u@x.nl','S','pt') returning id`, [T, U])).rows[0].id;
const goal = (await pg.query(`select id from public.curriculum_goals where code='ptbr-a2-01'`)).rows[0].id;
const goalNl = (await pg.query(`select id from public.curriculum_goals where code='nt2-a2-01'`)).rows[0].id;
const own2 = (await pg.query(`insert into public.curriculum_goals(subject,level,skill,title,owner_teacher,sort) values ('pt','A2','grammatica','Geheim van T2',$1,999) returning id`, [T2])).rows[0].id;

ok(await tries(U, `insert into public.topic_requests(student_id,goal_id) values ($1,$2)`, [s1, goal]) === 1, 'student requests a Portuguese topic');
ok(await tries(U, `insert into public.topic_requests(student_id,goal_id) values ($1,$2)`, [s1, goalNl]) === 1, 'and a Dutch one (same shared curriculum data)');
ok(await tries(U, `insert into public.topic_requests(student_id,goal_id) values ($1,$2)`, [s1, goal]) === -1, 'no double request');
ok(await tries(U, `insert into public.topic_requests(student_id,goal_id) values ($1,$2)`, [s1, own2]) === -1, "not another teacher's own topic");
ok(await tries(U2, `insert into public.topic_requests(student_id,goal_id) values ($1,$2)`, [s1, goal]) === -1, 'another student cannot ask for this student');
ok(await tries(U, `insert into public.topic_requests(student_id,goal_id,status) values ($1,$2,'accepted')`, [s1, own2]) === -1, 'a student cannot accept its own request');
ok((await q(U2, `select * from public.topic_requests where student_id=$1`, [s1])).rows.length === 0, 'another student sees nothing');
ok((await q(T2, `select * from public.topic_requests where student_id=$1`, [s1])).rows.length === 0, 'another teacher sees nothing');
ok((await q(T, `select * from public.topic_requests where student_id=$1`, [s1])).rows.length === 2, 'the teacher sees both requests');
ok((await pg.query(`select count(*)::int n from public.student_goal_progress where student_id=$1`, [s1])).rows[0].n === 0, 'a request changes no status');
ok(await tries(U, `insert into public.student_goal_progress(student_id,goal_id,status) values ($1,$2,'mastered')`, [s1, goal]) === -1, 'the student cannot mark a topic as mastered');

// withdraw: own open request only
ok(await tries(U, `delete from public.topic_requests where student_id=$1 and goal_id=$2`, [s1, goalNl]) === 1, 'student withdraws an open request');
// teacher accepts and links to a lesson topic; then the student can no longer delete or change it
const lg = (await q(T, `insert into public.lesson_goals(student_id,lesson_date,goal_id) values ($1,'2026-12-01',$2) returning id`, [s1, goal])).rows[0].id;
ok(await tries(T, `update public.topic_requests set status='accepted', lesson_goal_id=$2 where student_id=$1`, [s1, lg]) === 1, 'teacher accepts and links it to a lesson');
ok(await tries(U, `delete from public.topic_requests where student_id=$1`, [s1]) === 0, 'an accepted request cannot be withdrawn');
ok(await tries(U, `update public.topic_requests set status='open' where student_id=$1`, [s1]) === 0, 'the student cannot change a decision');
ok(await tries(T2, `update public.topic_requests set status='declined' where student_id=$1`, [s1]) === 0, 'another teacher cannot decide');
ok((await pg.query(`select outcome from public.lesson_goals where id=$1`, [lg])).rows[0].outcome === 'planned', 'accepted = planned, never covered automatically');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
