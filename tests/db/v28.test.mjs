// v28 migration + RLS tests in real PostgreSQL (PGlite). Run: npm run test:db
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
await pg.exec(sql('v26.sql'));
await pg.exec(sql('v27.sql'));
// existing lesson with words BEFORE v28 → must be backfilled into vocab
const T = '00000000-0000-0000-0000-0000000000b1', ANA = '00000000-0000-0000-0000-0000000000b2', S1 = '00000000-0000-0000-0000-0000000000b3', S2 = '00000000-0000-0000-0000-0000000000b4';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${T}','t@x.nl',now()),('${ANA}','ana@x.br',now()),('${S1}','s1@x.nl',now()),('${S2}','s2@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T}','t@x.nl','teacher'),('${ANA}','ana@x.br','teacher'),('${S1}','s1@x.nl','student'),('${S2}','s2@x.nl','student') on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { const r = await q(uid, text, params); return {ok: true, rows: r.rows, n: r.affectedRows}; } catch (e) { return {ok: false, error: e.message}; } };
const A = (await q(T, `insert into public.students(teacher_id,email,name,subject) values ($1,'s1@x.nl','A','Portugees') returning id`, [T])).rows[0].id;
const B = (await q(T, `insert into public.students(teacher_id,email,name) values ($1,'s2@x.nl','B') returning id`, [T])).rows[0].id;
// S1 is ALSO a student of Ana (two teachers)
const A2 = (await q(ANA, `insert into public.students(teacher_id,email,name,subject) values ($1,'s1@x.nl','A bij Ana','Portugees') returning id`, [ANA])).rows[0].id;
await q(S1, `select public.accept_student_link($1)`, [A]); await q(S1, `select public.accept_student_link($1)`, [A2]); await q(S2, `select public.accept_student_link($1)`, [B]);
await q(T, `insert into public.lesson_entries(student_id,lesson_date,words) values ($1,'2026-11-01','[{"nl":"ainda","uit":"nog"},{"nl":"ficar","uit":"blijven"}]')`, [A]);

console.log('\n=== v28 migration ===');
await pg.exec(sql('v28.sql')); await pg.exec(sql('v28.sql'));
ok(true, 'v28 runs (twice → idempotent)');
const seed = await pg.query(`select subject, count(*)::int n from public.curriculum_goals where owner_teacher is null group by subject order by subject`);
ok(seed.rows.length === 2 && seed.rows.every(r => r.n >= 25), `standard learning paths seeded (${seed.rows.map(r => r.subject + ':' + r.n).join(', ')})`);
const back = await q(T, `select term, source from public.vocab_items where student_id=$1 order by term`, [A]);
ok(back.rows.map(r => r.term).join(',') === 'ainda,ficar' && back.rows[0].source === 'lesson', 'existing lesson words backfilled into vocabulary');

console.log('\n=== Vocabulary ===');
await q(T, `update public.lesson_entries set words='[{"nl":"ainda","uit":"nog"},{"nl":"Valer a pena","uit":"de moeite waard"}]' where student_id=$1`, [A]);
const afterTrig = await q(T, `select term from public.vocab_items where student_id=$1 order by term`, [A]);
ok(afterTrig.rows.length === 3, 'classroom words flow into vocabulary automatically, duplicates merged');
const dup = await tryq(T, `insert into public.vocab_items(student_id,term) values ($1,'AINDA')`, [A]);
ok(!dup.ok, 'duplicate term (case-insensitive) rejected');
ok((await tryq(S1, `insert into public.vocab_items(student_id,term,source) values ($1,'saudade','student')`, [A])).ok, 'student adds own word');
const s1Forge = await tryq(S1, `insert into public.vocab_items(student_id,term,source,status) values ($1,'x','teacher','mastered')`, [A]);
ok(!s1Forge.ok, 'student cannot insert as teacher or as mastered');
const s1EditTeacher = await tryq(S1, `update public.vocab_items set status='mastered' where student_id=$1 and source<>'student'`, [A]);
ok(s1EditTeacher.ok && s1EditTeacher.n === 0, 'student cannot change teacher/lesson words');
const s2Read = await q(S2, `select * from public.vocab_items where student_id=$1`, [A]);
ok(s2Read.rows.length === 0, 'other student cannot read vocabulary');
const anaRead = await q(ANA, `select * from public.vocab_items where student_id=$1`, [A]);
ok(anaRead.rows.length === 0, 'other teacher of the same student cannot read this teacher\'s vocabulary');
const item = (await q(S1, `select id from public.vocab_items where student_id=$1 and term='ainda'`, [A])).rows[0].id;
for (let i = 0; i < 5; i++) await q(S1, `select public.record_vocab_practice($1,true)`, [item]);
const m = (await q(S1, `select status, streak, correct_count, due_at > now() + interval '1 day' far from public.vocab_items where id=$1`, [item])).rows[0];
ok(m.status === 'mastered' && m.correct_count === 5 && m.far, 'mastered only after 5 correct practice answers; next review pushed out');
await q(S1, `select public.record_vocab_practice($1,false)`, [item]);
const w = (await q(S1, `select status, streak from public.vocab_items where id=$1`, [item])).rows[0];
ok(w.status === 'practicing' && w.streak === 0, 'a wrong answer brings the word back for practice');
ok(!(await tryq(S2, `select public.record_vocab_practice($1,true)`, [item])).ok, 'other student cannot record practice on this word');

console.log('\n=== Learning paths ===');
const goal = (await q(T, `select id from public.curriculum_goals where code='pt-A2-gr-1'`)).rows[0].id;
ok((await tryq(T, `insert into public.student_goal_progress(student_id,goal_id,status,basis) values ($1,$2,'covered','ai_confirmed')`, [A, goal])).ok, 'teacher records progress (AI suggestion confirmed by teacher)');
ok(!(await tryq(S1, `update public.student_goal_progress set status='mastered' where student_id=$1`, [A])).n, 'student cannot change own goal status');
ok((await q(S1, `select status from public.student_goal_progress where student_id=$1`, [A])).rows[0]?.status === 'covered', 'student sees own goal progress');
ok((await q(ANA, `select * from public.student_goal_progress where student_id=$1`, [A])).rows.length === 0, 'other teacher cannot see this progress');
const own = await tryq(T, `insert into public.curriculum_goals(subject,level,skill,title,owner_teacher) values ('pt','A2','spreken','Mijn eigen doel',$1) returning id`, [T]);
ok(own.ok, 'teacher adds own learning goal');
ok(!(await tryq(T, `update public.curriculum_goals set title='hack' where code='pt-A1-gr-1'`)).n, 'teacher cannot alter standard goals');
ok((await q(S1, `select * from public.curriculum_goals where owner_teacher=$1`, [T])).rows.length === 1, 'student of that teacher can read the teacher\'s own goals');
ok((await q(S2, `select * from public.curriculum_goals where owner_teacher=$1`, [ANA])).rows.length === 0, 'unrelated student cannot read another teacher\'s own goals');

console.log('\n=== Lesson analyses ===');
const path1 = `${A}/r1.webm`;
await q(T, `insert into storage.objects(bucket_id,name) values ('recordings',$1)`, [path1]);
const rec = (await q(T, `insert into public.lesson_recordings(student_id,storage_path,teacher_consent_at,student_consent_at,created_by) values ($1,$2,now(),now(),$3) returning id`, [A, path1, T])).rows[0].id;
const noAi = await tryq(T, `insert into public.lesson_analyses(student_id,recording_id,created_by) values ($1,$2,$3)`, [A, rec, T]);
ok(!noAi.ok, 'analysis refused without AI consent of both participants');
await q(T, `update public.lesson_recordings set ai_consent_teacher_at=now() where id=$1`, [rec]).catch(() => {});
// lesson_recordings has no update policy → set consent as owner (simulates recording upload with consent)
await pg.query(`update public.lesson_recordings set ai_consent_teacher_at=now(), ai_consent_student_at=now() where id=$1`, [rec]);
const an = await tryq(T, `insert into public.lesson_analyses(student_id,recording_id,created_by,status,draft) values ($1,$2,$3,'ready','{"summary":"concept"}') returning id`, [A, rec, T]);
ok(an.ok, 'analysis created when both consented');
ok(!(await tryq(T, `insert into public.lesson_analyses(student_id,recording_id,created_by) values ($1,$2,$3)`, [A, rec, T])).ok, 'second analysis of the same recording is refused (no duplicates)');
ok(!(await tryq(ANA, `insert into public.lesson_analyses(student_id,created_by) values ($1,$2)`, [A, ANA])).ok, 'other teacher cannot create analyses for this student');
const sDraft = await q(S1, `select * from public.lesson_analyses`);
ok(sDraft.rows.length === 0, 'student can NEVER read drafts or transcripts directly');
ok((await q(S1, `select * from public.student_lesson_summaries($1)`, [A])).rows.length === 0, 'unapproved analysis not visible in student summaries');
ok(!(await tryq(T, `update public.lesson_analyses set status='approved' where id=$1`, [an.rows[0].id])).ok, 'cannot approve without a final version');
await q(T, `update public.lesson_analyses set status='approved', final='{"summary":"goedgekeurd"}', approved_by=$2, approved_at=now() where id=$1`, [an.rows[0].id, T]);
const sum = await q(S1, `select final from public.student_lesson_summaries($1)`, [A]);
ok(sum.rows.length === 1 && sum.rows[0].final.summary === 'goedgekeurd', 'student sees the approved summary only');
ok((await q(S2, `select * from public.student_lesson_summaries($1)`, [A])).rows.length === 0, 'other student cannot read the summary');

console.log('\n=== Practice ===');
ok((await tryq(S1, `insert into public.practice_sessions(student_id,user_id,kind,score,total) values ($1,$2,'quiz',8,10)`, [A, S1])).ok, 'student stores own practice result');
ok(!(await tryq(S1, `insert into public.practice_sessions(student_id,user_id,kind,score,total) values ($1,$2,'quiz',1,1)`, [B, S1])).ok, 'student cannot store results for another student');
ok(!(await tryq(S1, `insert into public.practice_sessions(student_id,user_id,kind,score,total) values ($1,$2,'quiz',11,10)`, [A, S1])).ok, 'impossible score rejected');
ok((await q(T, `select * from public.practice_sessions where student_id=$1`, [A])).rows.length === 1, 'teacher sees the student\'s results');

console.log('\n=== Archive / unlink / leave ===');
ok((await tryq(T, `update public.students set archived_at=now() where id=$1`, [B])).n === 1, 'teacher archives a student');
ok((await tryq(T, `update public.students set archived_at=null where id=$1`, [B])).n === 1, 'teacher restores the student');
await q(T, `select public.teacher_unlink_student($1)`, [B]);
ok((await q(S2, `select * from public.students where id=$1`, [B])).rows.length === 0, 'after unlink the student no longer sees the relation');
ok((await q(T, `select * from public.students where id=$1`, [B])).rows.length === 1, 'teacher keeps the record after unlinking');
ok(!(await tryq(ANA, `select public.teacher_unlink_student($1)`, [A])).ok, 'teacher cannot unlink another teacher\'s student');
await q(S1, `select public.student_leave_teacher($1)`, [A2]);
ok((await q(S1, `select id from public.students where user_id=$1`, [S1])).rows.map(r => r.id).join() === A, 'student leaving Ana keeps the link with the other teacher');
const delB = await tryq(T, `delete from public.students where id=$1`, [B]);
ok(delB.n === 1, 'teacher can permanently delete own student relation');
ok((await pg.query(`select count(*)::int n from auth.users where id=$1`, [S2])).rows[0].n === 1, 'deleting never removes the student\'s login account');
ok((await q(ANA, `select id from public.students where id=$1`, [A2])).rows.length === 1, 'other teacher\'s relation untouched');

console.log('\n=== Preferences & translation cache ===');
ok((await tryq(S1, `select public.set_my_language('pt')`)).ok && (await q(S1, `select preferred_language from public.profiles where id=$1`, [S1])).rows[0].preferred_language === 'pt', 'user sets own preferred language');
ok(!(await tryq(S1, `select public.set_my_language('x; drop')`)).ok, 'invalid language rejected');
ok((await q(S1, `select role from public.profiles where id=$1`, [S1])).rows[0].role === 'student', 'role unchanged (no self-promotion)');
ok((await tryq(S1, `insert into public.translation_cache(key,term,target_lang,result) values (repeat('a',64),'ainda','nl','{"t":"nog"}')`)).ok, 'translation cached');

console.log('\n=== AI usage log & speaker tracks ===');
ok((await tryq(S1, `insert into public.ai_usage(user_id,kind,model,input_tokens,output_tokens,cost_usd) values ($1,'translate','gpt-5.4-mini',100,20,0.00002)`, [S1])).ok, 'user logs own AI usage');
ok(!(await tryq(S1, `insert into public.ai_usage(user_id,kind) values ($1,'translate')`, [T])).ok, 'cannot log usage as someone else');
ok((await q(T, `select * from public.ai_usage`)).rows.length === 0, 'usage of others is not visible');
ok((await q(S1, `select count(*)::int n from public.ai_usage where user_id=$1 and kind='translate' and created_at > now() - interval '1 day'`, [S1])).rows[0].n === 1, 'daily count for limits works');
const tr = await tryq(T, `insert into public.lesson_recordings(student_id,storage_path,teacher_track_path,student_track_path,teacher_consent_at,student_consent_at,created_by) values ($1,$2,$3,$4,now(),now(),$5) returning id`, [A, `${A}/r2.webm`, `${A}/r2-teacher.webm`, `${A}/r2-student.webm`, T]);
ok(tr.ok, 'recording with separate teacher/student tracks stored');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
