// Account consolidation scripts (supabase/account-merge) for the REAL situation of 23 Nov 2026:
// main account = learner (and teacher role), other account = the teacher with students, lessons, recordings, reports.
// The merge moves the teacher side to the main account: links only, timestamps kept, nothing deleted; undo restores.
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql', 'v43.sql', 'v44.sql', 'v45.sql', 'v47.sql', 'v48.sql', 'v52.sql', 'v56.sql']) await pg.exec(sql(f));

const MAIN = '00000000-0000-0000-0000-0000000000e1', OTHER = '00000000-0000-0000-0000-0000000000e2', T2 = '00000000-0000-0000-0000-0000000000e3', X = '00000000-0000-0000-0000-0000000000e4';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${MAIN}','scipio.reimeringer@gmail.com',now()),('${OTHER}','scipreimer@gmail.com',now()),('${T2}','esther.teacher@x.nl',now()),('${X}','madison@x.nl',now());
  insert into public.profiles(id,email,role) values ('${MAIN}','scipio.reimeringer@gmail.com','teacher'),('${OTHER}','scipreimer@gmail.com','admin'),('${T2}','esther.teacher@x.nl','teacher'),('${X}','madison@x.nl','student') on conflict (id) do update set role=excluded.role;
  update public.profiles set timezone='America/Sao_Paulo', teaching_languages=array['nl','pt'] where id='${OTHER}';`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const st = async (teacher, email, subj, user) => (await pg.query(`insert into public.students(teacher_id,email,name,curriculum_subject,level,user_id) values ($1,$2,'S',$3,'A2',$4) returning id`, [teacher, email, subj, user])).rows[0].id;
const scipTest = await st(OTHER, 'scipio.reimeringer@gmail.com', 'nl', MAIN);   // "Scip test": taught by OTHER, learner MAIN
const scipio = await st(T2, 'scipio.reimeringer@gmail.com', 'pt', MAIN);       // "Scipio": Portuguese with another teacher
const madison = await st(OTHER, 'madison@x.nl', 'nl', X);                      // a real student of the teacher account
const lessons = (await q(OTHER, `select id from public.schedule_lessons($1,'2026-12-01 10:00'::timestamp,'Europe/Amsterdam',60,3)`, [madison])).rows.map(r => r.id);
const rec = (await pg.query(`insert into public.lesson_recordings(student_id,storage_path,mime_type,size_bytes,duration_seconds,teacher_consent_at,student_consent_at,created_by,lesson_date,ai_consent_teacher_at,ai_consent_student_at)
  values ($1::uuid,$1::text||'/2026-11-22-'||gen_random_uuid()::text||'.webm','audio/webm',1,60,now(),now(),$2,'2026-11-22',now(),now()) returning id`, [madison, OTHER])).rows[0].id;
await pg.query(`insert into public.lesson_analyses(student_id,recording_id,lesson_date,status,created_by,final,approved_by,approved_at) values ($1,$2,'2026-11-22','approved',$3,'{"version":2}',$3,now())`, [madison, rec, OTHER]);
await pg.query(`insert into public.ai_usage(user_id,student_id,kind) values ($1,$2,'analysis'),($1,$2,'translate')`, [OTHER, madison]);
await pg.query(`insert into public.curriculum_goals(subject,level,skill,title,owner_teacher) values ('nl','A2','grammatica','Eigen doel',$1)`, [OTHER]);
await pg.query(`insert into public.game_rounds(id,student_id,session_id,round_no,kind,explainer_user_id,vocab_ids,cards,created_by) values (gen_random_uuid(),$1,gen_random_uuid(),1,'thirty',$2,'{}','[]',$2)`, [madison, OTHER]);
await q(OTHER, `select public.gcal_connect('oud.preply@gmail.com','v1:OLD')`);
await q(OTHER, `select public.gcal_choose_calendar('preply','Preply Schedule')`);
await pg.exec(`delete from public.calendar_outbox;`);
const count = async t => (await pg.query(`select count(*)::int n from ${t}`)).rows[0].n;
const stamps = JSON.stringify((await pg.query(`select id, updated_at, created_at from public.lessons order by id`)).rows);
const before = {lessons: await count('public.lessons'), students: await count('public.students'), analyses: await count('public.lesson_analyses'), usage: await count('public.ai_usage')};

console.log('\n=== 01 diagnose (read-only) ===');
const d = await pg.query(sql('account-merge/01-diagnose.sql'));
ok(d.rows[0].detail.main.role === 'teacher' && d.rows[0].detail.other.role === 'admin', 'shows both accounts and roles');
ok(d.rows[2].detail['lessons as teacher'] === 3 && d.rows[2].detail['students as teacher'] === 2, 'shows the teaching side of the other account');

console.log('\n=== 02 backup ===');
await pg.exec(sql('account-merge/02-backup.sql'));
ok((await count('merge_backup_20261123.lessons')) === 3 && (await count('merge_backup_20261123.students')) === 2, 'copies of lessons and students');

console.log('\n=== 03 merge ===');
await pg.exec(sql('account-merge/03-merge.sql'));
ok((await pg.query(`select role, timezone, teaching_languages from public.profiles where id='${MAIN}'`)).rows.every(r => r.role === 'admin' && r.timezone === 'America/Sao_Paulo' && r.teaching_languages.join() === 'nl,pt'), 'main account: admin + teaching settings');
ok((await count(`public.students where teacher_id='${MAIN}'`)) === 2, 'the teacher\'s students now belong to the main account');
ok((await pg.query(`select teacher_id, user_id from public.students where id='${scipTest}'`)).rows[0].teacher_id === MAIN, '"Scip test" is now an own learner profile (teacher = learner = main)');
ok((await pg.query(`select teacher_id from public.students where id='${scipio}'`)).rows[0].teacher_id === T2, 'the Portuguese profile with another teacher is untouched');
ok((await count(`public.lessons where teacher_id='${MAIN}' and created_by='${MAIN}'`)) === 3, 'lessons belong to the main account');
ok(JSON.stringify((await pg.query(`select id, updated_at, created_at from public.lessons order by id`)).rows) === stamps, 'lesson timestamps unchanged (triggers paused)');
ok((await count('public.calendar_outbox')) === 0, 'nothing queued for the old Google calendar');
ok((await count(`public.calendar_connections where teacher_id='${OTHER}'`)) === 1 && (await count(`public.calendar_connections where teacher_id='${MAIN}'`)) === 0, 'the old (Preply) calendar connection is NOT moved');
ok((await count(`public.lesson_recordings where created_by='${MAIN}'`)) === 1 && (await count(`public.lesson_analyses where created_by='${MAIN}' and approved_by='${MAIN}'`)) === 1, 'recordings and reports');
ok((await count(`public.ai_usage where user_id='${MAIN}'`)) === 2 && (await count(`public.curriculum_goals where owner_teacher='${MAIN}'`)) === 1 && (await count(`public.game_rounds where created_by='${MAIN}'`)) === 1, 'AI usage, own goals, game rounds');
ok((await count('public.lessons')) === before.lessons && (await count('public.students')) === before.students && (await count('public.lesson_analyses')) === before.analyses && (await count('public.ai_usage')) === before.usage, 'nothing copied, nothing deleted');
ok((await count(`auth.users where id='${OTHER}'`)) === 1, 'the other account itself is NOT deleted');
// the main account can now work as teacher (RLS) and plan lessons; triggers are active again
ok((await q(MAIN, `select count(*)::int n from public.lessons`)).rows[0].n === 3, 'the main account sees the lessons as teacher (RLS)');
ok((await q(MAIN, `select id from public.schedule_lessons($1,'2026-12-20 10:00'::timestamp,'Europe/Amsterdam',60,1)`, [madison])).rows.length === 1, 'and can plan a new lesson (guards active again)');
ok(!(await q(OTHER, `select count(*)::int n from public.lessons where student_id=$1`, [madison])).rows[0].n, 'the other account no longer sees those lessons');

console.log('\n=== 04 undo ===');
await pg.exec(`delete from public.lessons where starts_at >= '2026-12-20'`);
await pg.exec(sql('account-merge/04-undo.sql'));
ok((await count(`public.students where teacher_id='${OTHER}'`)) === 2 && (await count(`public.lessons where teacher_id='${OTHER}'`)) === 3, 'students and lessons back');
ok((await pg.query(`select role from public.profiles where id='${MAIN}'`)).rows[0].role === 'teacher', 'role back');
ok((await count(`public.ai_usage where user_id='${OTHER}'`)) === 2, 'AI usage back');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
