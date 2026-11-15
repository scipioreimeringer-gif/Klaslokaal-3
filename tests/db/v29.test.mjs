// v29 migration + RLS tests in real PostgreSQL (PGlite): languages, several teachers, profile photos.
// Run: npm run test:db
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql']) await pg.exec(sql(f));

const T = '00000000-0000-0000-0000-0000000000c1', ANA = '00000000-0000-0000-0000-0000000000c2', S1 = '00000000-0000-0000-0000-0000000000c3', S2 = '00000000-0000-0000-0000-0000000000c4';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
   ('${T}','t@x.nl',now(),'{"avatar_url":"https://lh3.googleusercontent.com/t"}'),('${ANA}','ana@x.br',now(),'{}'),
   ('${S1}','s1@x.nl',now(),'{"picture":"https://lh3.googleusercontent.com/s1"}'),('${S2}','s2@x.nl',now(),'{"avatar_url":"javascript:alert(1)"}');
  insert into public.profiles(id,email,role,full_name) values ('${T}','t@x.nl','teacher','Tom'),('${ANA}','ana@x.br','teacher','Ana'),('${S1}','s1@x.nl','student','Sara'),('${S2}','s2@x.nl','student','Sem')
   on conflict (id) do update set role=excluded.role, full_name=excluded.full_name;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { const r = await q(uid, text, params); return {ok: true, rows: r.rows, n: r.affectedRows}; } catch (e) { return {ok: false, error: e.message}; } };

// existing data BEFORE v29: Tom teaches Sara Portuguese (legacy row: language only in the free-text subject)
const A = (await q(T, `insert into public.students(teacher_id,email,name,subject) values ($1,'s1@x.nl','Sara','Portugees') returning id`, [T])).rows[0].id;
await q(S1, `select public.accept_student_link($1)`, [A]);
await q(T, `insert into public.lesson_entries(student_id,lesson_date,words) values ($1,'2026-11-01','[{"nl":"ainda","uit":"nog"}]')`, [A]);
const before = (await pg.query(`select (select count(*) from public.students)::int s, (select count(*) from public.lesson_entries)::int l, (select count(*) from public.vocab_items)::int v`)).rows[0];
// old rule: a second language with the same teacher was impossible
ok(!(await tryq(T, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'s1@x.nl','Sara NL','nl')`, [T])).ok, 'before v29: same teacher cannot add a second language for the same student');

console.log('\n=== v29 migration ===');
await pg.exec(sql('v29.sql')); await pg.exec(sql('v29.sql'));
ok(true, 'v29 runs (twice → idempotent)');
const after = (await pg.query(`select (select count(*) from public.students)::int s, (select count(*) from public.lesson_entries)::int l, (select count(*) from public.vocab_items)::int v`)).rows[0];
ok(JSON.stringify(before) === JSON.stringify(after), `existing data preserved (students ${after.s}, lessons ${after.l}, words ${after.v})`);
ok((await q(S1, `select id from public.students where id=$1 and user_id=$2`, [A, S1])).rows.length === 1, 'existing link teacher–student unchanged');

console.log('\n=== Several languages and teachers ===');
const N = await tryq(T, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'s1@x.nl','Sara NL','nl') returning id`, [T]);
ok(N.ok, 'scenario 2: same teacher teaches the same student a second language (Dutch)');
ok(!(await tryq(T, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'s1@x.nl','Sara bis','pt')`, [T])).ok, 'duplicate teacher + language rejected (legacy "Portugees" row counts as pt)');
ok(!(await tryq(T, `insert into public.students(teacher_id,email,name,subject) values ($1,'s1@x.nl','Sara 3','Nederlands')`, [T])).ok, 'duplicate via free-text subject also rejected');
ok((await q(S1, `select public.accept_student_link($1)`, [N.rows[0].id])) && true, 'student accepts second language from the same teacher');
const A2 = (await q(ANA, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'s1@x.nl','Sara','pt') returning id`, [ANA])).rows[0].id;
await q(S1, `select public.accept_student_link($1)`, [A2]);
const mine = await q(S1, `select teacher_id, public.relation_language(curriculum_subject,subject,lesson_language) lang from public.students where user_id=$1 order by lang, teacher_id`, [S1]);
ok(mine.rows.map(r => r.lang).join(',') === 'nl,pt,pt', 'scenario 3/4: student sees 3 relations: nl (Tom), pt (Tom), pt (Ana)');
ok(!(await tryq(T, `update public.students set curriculum_subject='pt' where id=$1`, [N.rows[0].id])).ok, 'changing a relation into a duplicate language is rejected');
ok((await q(ANA, `select * from public.students where id=$1`, [A])).rows.length === 0, 'Ana cannot read Tom\'s relation with the same student');
ok((await q(ANA, `select * from public.lesson_entries where student_id=$1`, [A])).rows.length === 0, 'Ana cannot read Tom\'s lessons (data separated per relation)');
ok((await q(T, `select * from public.vocab_items where student_id=$1`, [A2])).rows.length === 0, 'Tom cannot read Ana\'s vocabulary');

console.log('\n=== Self-study languages ===');
ok((await tryq(S1, `insert into public.student_languages(language,level) values ('es','A1')`)).ok, 'scenario 1: student adds a self-study language without teacher');
ok(!(await tryq(S1, `insert into public.student_languages(language) values ('es')`)).ok, 'same language twice rejected');
ok(!(await tryq(S1, `insert into public.student_languages(user_id,language) values ($1,'fr')`, [S2])).ok, 'cannot add a language for another account');
ok(!(await tryq(S1, `insert into public.student_languages(language,level) values ('xx1','A1')`)).ok, 'invalid language code rejected');
ok((await q(S2, `select * from public.student_languages`)).rows.length === 0, 'other student cannot see my languages');
ok((await q(T, `select * from public.student_languages`)).rows.length === 0, 'teachers cannot see self-study languages');
ok((await tryq(S1, `update public.student_languages set level='A2' where language='es'`)).n === 1, 'student updates own level');
ok((await tryq(S2, `delete from public.student_languages`)).n === 0, 'other student cannot delete my languages');

console.log('\n=== Profile photos ===');
ok((await tryq(S1, `select public.set_my_avatar($1)`, [S1 + '/avatar-1.webp'])).ok, 'student sets own photo path');
ok(!(await tryq(S1, `select public.set_my_avatar($1)`, [T + '/avatar-1.webp'])).ok, 'cannot point to another user\'s folder');
ok(!(await tryq(S1, `select public.set_my_avatar($1)`, [S1 + '/../x.webp'])).ok, 'path traversal rejected');
ok((await q(S1, `select role from public.profiles where id=$1`, [S1])).rows[0].role === 'student', 'role unchanged by profile functions');
await pg.exec(`insert into storage.buckets(id,name,public) values ('avatars','avatars',false) on conflict do nothing`);
ok((await tryq(S1, `insert into storage.objects(bucket_id,name) values ('avatars',$1)`, [S1 + '/avatar-1.webp'])).ok, 'scenario 6: student uploads own photo');
ok(!(await tryq(S1, `insert into storage.objects(bucket_id,name) values ('avatars',$1)`, [T + '/evil.webp'])).ok, 'cannot upload into another user\'s folder');
ok((await q(T, `select name from storage.objects where bucket_id='avatars'`)).rows.length === 1, 'teacher of the student can see the photo');
ok((await q(ANA, `select name from storage.objects where bucket_id='avatars'`)).rows.length === 1, 'second teacher of the student can see the photo');
ok((await q(S2, `select name from storage.objects where bucket_id='avatars'`)).rows.length === 0, 'unrelated student cannot see the photo');
ok((await tryq(T, `delete from storage.objects where bucket_id='avatars'`)).n === 0, 'teacher cannot delete the student\'s photo');
ok((await tryq(S1, `insert into storage.objects(bucket_id,name) values ('avatars',$1)`, [S1 + '/avatar-2.webp'])).ok && (await tryq(S1, `delete from storage.objects where name=$1`, [S1 + '/avatar-1.webp'])).n === 1, 'replace: upload new, delete old');
ok((await tryq(S1, `select public.set_my_avatar(null)`)).ok && (await q(S1, `select avatar_path from public.profiles where id=$1`, [S1])).rows[0].avatar_path === null, 'remove photo (back to default)');
await q(S1, `select public.set_my_avatar($1)`, [S1 + '/avatar-2.webp']);
const rp = await q(S1, `select * from public.related_people() order by full_name`);
ok(rp.rows.map(r => r.full_name).join(',') === 'Ana,Sara,Tom', 'student sees name/photo of self and both teachers only');
ok(rp.rows.find(r => r.full_name === 'Tom').google_avatar === 'https://lh3.googleusercontent.com/t' && rp.rows.find(r => r.full_name === 'Sara').avatar_path === S1 + '/avatar-2.webp', 'Google photo as default, own upload when set');
const rpT = await q(T, `select * from public.related_people() order by full_name`);
ok(rpT.rows.map(r => r.full_name).join(',') === 'Sara,Tom', 'teacher sees own and linked students only (not Sem, not Ana)');
const rpS2 = await q(S2, `select * from public.related_people()`);
ok(rpS2.rows.length === 1 && rpS2.rows[0].google_avatar === null, 'unsafe avatar URL (non-https) never exposed');

console.log('\n=== Teacher languages ===');
ok((await tryq(T, `select public.set_my_teaching_languages(array['nl','pt'])`)).ok, 'teacher offers several languages');
ok(!(await tryq(S1, `select public.set_my_teaching_languages(array['nl'])`)).ok, 'student cannot set teaching languages');
ok(!(await tryq(T, `select public.set_my_teaching_languages(array['nl','x'])`)).ok, 'invalid language rejected');
ok((await q(S1, `select teaching_languages from public.related_people() where full_name='Tom'`)).rows[0].teaching_languages.join(',') === 'nl,pt', 'student sees languages of own teacher');

console.log('\n=== Teacher + student on one account (scenario 5) ===');
// Ana (teacher) takes Dutch lessons with Tom
const AT = (await q(T, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'ana@x.br','Ana','nl') returning id`, [T])).rows[0].id;
await q(ANA, `select public.accept_student_link($1)`, [AT]);
ok((await q(ANA, `select id from public.students where teacher_id=$1`, [ANA])).rows.length === 1 && (await q(ANA, `select id from public.students where user_id=$1`, [ANA])).rows.length === 1, 'teacher account keeps own students and has own student relation');
ok((await q(ANA, `select * from public.lesson_entries where student_id=$1`, [A])).rows.length === 0, 'as a student Ana still cannot see Tom\'s other students');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
