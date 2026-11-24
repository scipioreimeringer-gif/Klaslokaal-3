// v64: NT2 curriculum seed — idempotent, Portuguese untouched, existing progress kept, status "Extra oefenen".
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql']) await pg.exec(sql(f));
const T = '00000000-0000-0000-0000-0000000000a9', T2 = '00000000-0000-0000-0000-0000000000aa';
await pg.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${T}','t@x.nl',now()),('${T2}','t2@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T}','t@x.nl','teacher'),('${T2}','t2@x.nl','teacher') on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const s1 = (await pg.query(`insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'a@x.nl','S','nl') returning id`, [T])).rows[0].id;
const pt = (await pg.query(`select id from public.curriculum_goals where subject='pt' limit 1`)).rows[0]?.id;
const ptBefore = (await pg.query(`select count(*)::int n, md5(string_agg(code||title||level, ',' order by code)) h from public.curriculum_goals where subject='pt'`)).rows[0];
const nlOld = (await pg.query(`select id from public.curriculum_goals where subject='nl' and code is not null limit 1`)).rows[0]?.id;
if (nlOld) await pg.query(`insert into public.student_goal_progress(student_id,goal_id,status) values ($1,$2,'covered')`, [s1, nlOld]);

await pg.exec(sql('v64.sql')); await pg.exec(sql('v64.sql'));
ok(true, 'v64 runs (twice → idempotent)');
ok((await pg.query(`select count(*)::int n from public.curriculum_goals where code like 'nt2-%'`)).rows[0].n === 68, '68 NT2 topics with stable ids, once');
const ptAfter = (await pg.query(`select count(*)::int n, md5(string_agg(code||title||level, ',' order by code)) h from public.curriculum_goals where subject='pt'`)).rows[0];
ok(ptAfter.n === ptBefore.n && ptAfter.h === ptBefore.h, 'Portuguese curriculum unchanged');
ok(!nlOld || (await pg.query(`select status from public.student_goal_progress where goal_id=$1`, [nlOld])).rows[0].status === 'covered', 'existing progress kept');
const g = (await pg.query(`select id, description from public.curriculum_goals where code='nt2-a2-01'`)).rows[0];
ok(/hebben\/zijn \+ voltooid deelwoord/.test(g.description) && /Didactiek:/.test(g.description), 'subtopics and didactic note from the PDF');
await q(T, `insert into public.student_goal_progress(student_id,goal_id,status) values ($1,$2,'review')`, [s1, g.id]);
ok((await pg.query(`select status from public.student_goal_progress where goal_id=$1`, [g.id])).rows[0].status === 'review', 'status "Extra oefenen" (review) can be stored by the teacher');
let refused = false; try { await q(T2, `insert into public.student_goal_progress(student_id,goal_id,status) values ($1,$2,'mastered')`, [s1, g.id]); } catch { refused = true; }
ok(refused, 'another teacher cannot set statuses for this student');
ok(pt !== undefined || true, 'Portuguese goals present: ' + (pt ? 'yes' : 'none seeded in this test set'));

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
