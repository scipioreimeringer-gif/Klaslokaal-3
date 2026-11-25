// v68: Brazilian-Portuguese curriculum + lesson topics — idempotent, Dutch untouched, progress carried over without
// overwriting a teacher assessment, lesson topics with note/sub, RLS (other teacher / student cannot write).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v64.sql']) await pg.exec(sql(f));
const T = '00000000-0000-0000-0000-0000000000b1', T2 = '00000000-0000-0000-0000-0000000000b2', U = '00000000-0000-0000-0000-0000000000b3';
await pg.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${T}','t@x.nl',now()),('${T2}','t2@x.nl',now()),('${U}','u@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T}','t@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${U}','u@x.nl','student') on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const s1 = (await pg.query(`insert into public.students(teacher_id,user_id,email,name,curriculum_subject) values ($1,$2,'u@x.nl','S','pt') returning id`, [T, U])).rows[0].id;
const id = async code => (await pg.query(`select id from public.curriculum_goals where code=$1`, [code])).rows[0]?.id;
const serOld = await id('pt-A1-gr-2'), perfOld = await id('pt-A2-gr-5');
ok(!!serOld && !!perfOld, 'older Portuguese goals exist');
await pg.query(`insert into public.student_goal_progress(student_id,goal_id,status,note) values ($1,$2,'mastered','vast'),($1,$3,'review','')`, [s1, serOld, perfOld]);
const nlBefore = (await pg.query(`select md5(string_agg(code||title||description, ',' order by code)) h from public.curriculum_goals where code like 'nt2-%'`)).rows[0].h;

await pg.exec(sql('v68.sql'));
const serNew = await id('ptbr-a1-03'), perfNew = await id('ptbr-a2-04');
ok((await pg.query(`select status, note from public.student_goal_progress where student_id=$1 and goal_id=$2`, [s1, serNew])).rows[0]?.status === 'mastered', 'progress carried over to the new topic (Ser e estar: mastered)');
// the teacher changes the new topic; running v68 again must not overwrite that assessment
await pg.query(`update public.student_goal_progress set status='in_progress' where student_id=$1 and goal_id=$2`, [s1, perfNew]);
await pg.exec(sql('v68.sql'));
ok((await pg.query(`select count(*)::int n from public.curriculum_goals where code like 'ptbr-%'`)).rows[0].n === 77, '77 Portuguese topics with stable ids, once (idempotent)');
ok((await pg.query(`select status from public.student_goal_progress where student_id=$1 and goal_id=$2`, [s1, perfNew])).rows[0].status === 'in_progress', 'a teacher assessment is never overwritten');
ok((await pg.query(`select status from public.student_goal_progress where student_id=$1 and goal_id=$2`, [s1, serOld])).rows[0].status === 'mastered', 'old progress row kept');
ok((await pg.query(`select md5(string_agg(code||title||description, ',' order by code)) h from public.curriculum_goals where code like 'nt2-%'`)).rows[0].h === nlBefore, 'Dutch curriculum unchanged');
ok(/Voorbeeld: Sou professor\./.test((await pg.query(`select description from public.curriculum_goals where code='ptbr-a1-03'`)).rows[0].description), 'examples stored in the description');

// lesson topics: teacher writes with note + sub; student reads; other teacher / student cannot write
await q(T, `insert into public.lesson_goals(student_id,lesson_date,goal_id,note,sub) values ($1,'2026-11-25',$2,'focus op estar',array['Toestand en locatie (estar)'])`, [s1, serNew]);
const row = (await q(U, `select note, sub, outcome from public.lesson_goals where student_id=$1`, [s1])).rows[0];
ok(row?.note === 'focus op estar' && row.sub.length === 1 && row.outcome === 'planned', 'lesson topic with note and sub-topic, planned by default');
let refused = false; try { await q(T2, `insert into public.lesson_goals(student_id,lesson_date,custom_title) values ($1,'2026-11-25','x')`, [s1]); } catch { refused = true; }
ok(refused, 'another teacher cannot add lesson topics');
refused = false; try { await q(U, `insert into public.lesson_goals(student_id,lesson_date,custom_title) values ($1,'2026-11-25','x')`, [s1]); } catch { refused = true; }
ok(refused, 'the student cannot add lesson topics');
refused = false; try { await q(T, `insert into public.lesson_goals(student_id,lesson_date,custom_title,note) values ($1,'2026-11-25','x',repeat('a',501))`, [s1]); } catch { refused = true; }
ok(refused, 'notes are capped at 500 characters');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
