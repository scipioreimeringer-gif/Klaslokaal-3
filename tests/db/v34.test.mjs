// v34: analysis pipeline state, homework drafts, personal learning path (PGlite).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql']) await pg.exec(sql(f));

const ADM = '00000000-0000-0000-0000-0000000000b1', T1 = '00000000-0000-0000-0000-0000000000b2', T2 = '00000000-0000-0000-0000-0000000000b3', S = '00000000-0000-0000-0000-0000000000b4', S2 = '00000000-0000-0000-0000-0000000000b5';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${ADM}','adm@x.nl',now()),('${T1}','t1@x.nl',now()),('${T2}','t2@x.nl',now()),('${S}','s@x.nl',now()),('${S2}','s2@x.nl',now());
  insert into public.profiles(id,email,role) values ('${ADM}','adm@x.nl','admin'),('${T1}','t1@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${S}','s@x.nl','student'),('${S2}','s2@x.nl','student')
   on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { const r = await q(uid, text, params); return {ok: true, rows: r.rows, n: r.affectedRows}; } catch (e) { return {ok: false, error: e.message}; } };

// one student, Dutch with T1 and Dutch with T2 (two teachers, same language); existing progress + analysis
const R1 = (await q(T1, `insert into public.students(teacher_id,email,name,curriculum_subject,level) values ($1,'s@x.nl','Sofia','nl','A2') returning id`, [T1])).rows[0].id;
const R2 = (await q(T2, `insert into public.students(teacher_id,email,name,curriculum_subject,level) values ($1,'s@x.nl','Sofia','nl','A2') returning id`, [T2])).rows[0].id;
for (const r of [R1, R2]) await q(S, `select public.accept_student_link($1)`, [r]);
const inv = (await q(T1, `select id from public.curriculum_goals where code='nl-A1-gr-4'`)).rows[0].id;
await q(T1, `insert into public.student_goal_progress(student_id,goal_id,status,basis) values ($1,$2,'in_progress','teacher')`, [R1, inv]);
const oldA = (await q(T1, `insert into public.lesson_analyses(student_id,lesson_date,status,created_by) values ($1,'2026-11-01','processing',$2) returning id`, [R1, T1])).rows[0].id;
const before = (await pg.query(`select (select count(*) from public.curriculum_goals)::int g, (select count(*) from public.student_goal_progress)::int p`)).rows[0];

console.log('\n=== v34 migration ===');
await pg.exec(sql('v34.sql')); await pg.exec(sql('v34.sql'));
ok(true, 'v34 runs (twice → idempotent)');
ok((await q(T1, `select status from public.student_goal_progress where student_id=$1 and goal_id=$2`, [R1, inv])).rows[0].status === 'in_progress', 'existing progress unchanged');
ok((await q(T1, `select pipeline_version from public.lesson_analyses where id=$1`, [oldA])).rows[0].pipeline_version === 1, 'existing analyses keep version 1');
const per = (await pg.query(`select subject, count(*)::int n from public.curriculum_goals where owner_teacher is null group by subject order by subject`)).rows;
ok(['de', 'en', 'es', 'fr', 'nl', 'pt'].every(s => per.some(r => r.subject === s && r.n >= 25)), `standard curriculum for 6 languages (${per.map(r => r.subject + ':' + r.n).join(', ')})`);
ok((await pg.query(`select count(*)::int n from public.curriculum_goals`)).rows[0].n > before.g, 'new topics added, none replaced');
ok((await pg.query(`select count(distinct skill)::int n from public.curriculum_goals where subject='nl'`)).rows[0].n >= 6, 'categories include sentence structure, communication, pronunciation');

console.log('\n=== learning path per student ===');
const pt = (await q(T1, `select id from public.curriculum_goals where code='nl-A2-gr-2'`)).rows[0].id;
ok((await tryq(T1, `insert into public.student_goal_progress(student_id,goal_id,status,basis,title_override,level_override,hidden,lesson_refs) values ($1,$2,'covered','teacher','Perfectum met hebben','A1',false,'["2026-11-10"]')`, [R1, pt])).ok, 'teacher renames/moves a topic for one student, with lesson reference');
ok(!(await tryq(T1, `update public.student_goal_progress set level_override='Z9' where student_id=$1`, [R1])).ok, 'invalid level rejected');
ok((await tryq(T1, `update public.students set target_level='B1' where id=$1`, [R1])).n === 1, 'teacher sets a target level');
ok((await q(T2, `select * from public.student_goal_progress where student_id=$1`, [R1])).rows.length === 0, 'second teacher of the same student does not see the first teacher\'s path');
ok((await tryq(T2, `update public.student_goal_progress set status='mastered' where student_id=$1`, [R1])).n === 0, '… and cannot change it');
ok((await q(S, `select status from public.student_goal_progress where student_id=$1`, [R1])).rows.length === 2, 'student sees own path');
ok((await tryq(S, `update public.student_goal_progress set status='mastered' where student_id=$1`, [R1])).n === 0, 'student cannot change statuses');
ok((await tryq(T1, `insert into public.student_goal_progress(student_id,goal_id,status,basis) values ($1,$2,'covered','intake')`, [R1, (await q(T1, `select id from public.curriculum_goals where code='nl-A1-gr-1'`)).rows[0].id])).ok, 'intake marking allowed (basis intake)');
ok((await tryq(T1, `insert into public.lesson_goals(student_id,lesson_date,goal_id) values ($1,'2026-11-20',$2)`, [R1, inv])).ok, 'teacher sets "today we work on" from the checklist');
ok((await tryq(T1, `insert into public.lesson_goals(student_id,lesson_date,custom_title) values ($1,'2026-11-20','Vertellen over het weekend')`, [R1])).ok, '… and an own lesson goal');
ok(!(await tryq(T1, `insert into public.lesson_goals(student_id,lesson_date) values ($1,'2026-11-20')`, [R1])).ok, 'empty lesson goal rejected');
ok((await q(S, `select * from public.lesson_goals where student_id=$1`, [R1])).rows.length === 2 && (await q(S2, `select * from public.lesson_goals`)).rows.length === 0, 'student sees own lesson goals; others nothing');
ok((await tryq(T1, `insert into public.curriculum_goals(subject,level,skill,title,owner_teacher) values ('nl','A2','grammatica','Scheidbare werkwoorden in de verleden tijd',$1)`, [T1])).ok, 'teacher adds own topic');
ok(!(await tryq(T1, `update public.curriculum_goals set title='x' where code='nl-A1-gr-4'`)).n, 'standard topics cannot be renamed globally (per student via override)');

console.log('\n=== analysis pipeline state ===');
const A = (await q(T1, `insert into public.lesson_analyses(student_id,lesson_date,status,created_by,pipeline_version) values ($1,'2026-11-20','processing',$2,2) returning id`, [R1, T1])).rows[0].id;
ok((await q(T1, `select public.claim_analysis($1, 120) c`, [A])).rows[0].c === true, 'runner claims the analysis');
ok((await q(T1, `select public.claim_analysis($1, 120) c`, [A])).rows[0].c === false, 'a second runner is refused (no double analysis)');
await q(T1, `select public.release_analysis($1)`, [A]);
ok((await q(T1, `select public.claim_analysis($1, 120) c`, [A])).rows[0].c === true, 'after release it can be resumed');
ok((await tryq(T1, `insert into public.lesson_analysis_parts(analysis_id,idx,status,result) values ($1,0,'done','{"errors":[]}')`, [A])).ok, 'part result stored');
ok(!(await tryq(T1, `insert into public.lesson_analysis_parts(analysis_id,idx,status,result) values ($1,0,'done','{}')`, [A])).ok, 'the same part cannot be stored twice');
ok((await q(S, `select * from public.lesson_analysis_parts`)).rows.length === 0 && (await q(T2, `select * from public.lesson_analysis_parts`)).rows.length === 0, 'parts invisible to student and to the other teacher');

console.log('\n=== publication and homework ===');
await q(T1, `update public.lesson_analyses set status='approved', final='{"version":2}', published_at=now() where id=$1`, [A]);
ok((await q(S, `select * from public.student_lesson_summaries($1)`, [R1])).rows.length === 1, 'published analysis visible to the student');
ok((await q(S, `select * from public.student_lesson_summaries($1)`, [R2])).rows.length === 0, '… only under the right teacher relation');
const H0 = await tryq(T1, `insert into public.assignments(student_id,title,instructions,analysis_id,origin) values ($1,'Huiswerk inversie','…',$2,'ai_analysis')`, [R1, A]); // as the app does: no RETURNING (v23 policy)
const H = {ok: H0.ok, error: H0.error, rows: H0.ok ? (await q(T1, `select id from public.assignments where analysis_id=$1`, [A])).rows : []};
ok(H.ok, 'homework draft created from the analysis');
ok(!(await tryq(T1, `insert into public.assignments(student_id,title,instructions,analysis_id,origin) values ($1,'dubbel','…',$2,'ai_analysis')`, [R1, A])).ok, 'second homework draft for the same analysis rejected (retry-safe)');
ok((await q(S, `select * from public.assignments where id=$1`, [H.rows[0].id])).rows.length === 0, 'student cannot see the draft');
await q(T1, `update public.assignments set published_at=now() where id=$1`, [H.rows[0].id]);
ok((await q(S, `select * from public.assignments where id=$1`, [H.rows[0].id])).rows.length === 1, 'after the teacher publishes, the student sees it');
// TEST analyses: never homework
const R3 = (await q(ADM, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'s2@x.nl','Test','nl') returning id`, [ADM])).rows[0].id;
const TA = (await q(ADM, `insert into public.lesson_analyses(student_id,lesson_date,status,created_by,is_test,pipeline_version) values ($1,current_date,'processing',$2,true,2) returning id`, [R3, ADM])).rows[0].id;
ok(!(await tryq(ADM, `insert into public.assignments(student_id,title,instructions,analysis_id) values ($1,'t','…',$2)`, [R3, TA])).ok, 'no homework from a TEST analysis');
ok(!(await tryq(T1, `insert into public.assignments(student_id,title,instructions,analysis_id) values ($1,'t','…',$2)`, [R1, TA])).ok, 'no homework linked to another student\'s analysis');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
