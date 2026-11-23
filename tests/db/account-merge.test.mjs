// Account consolidation scripts (supabase/account-merge): diagnose is read-only, backup copies, merge links the learner
// side to the main account without copying or deleting, undo puts everything back (PGlite, real migrations).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql', 'v43.sql', 'v44.sql', 'v45.sql', 'v47.sql', 'v48.sql']) await pg.exec(sql(f));

const MAIN = '00000000-0000-0000-0000-0000000000e1', OTHER = '00000000-0000-0000-0000-0000000000e2', T2 = '00000000-0000-0000-0000-0000000000e3', X = '00000000-0000-0000-0000-0000000000e4';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${MAIN}','scipio.reimeringer@gmail.com',now()),('${OTHER}','scipreimer@gmail.com',now()),('${T2}','t2@x.nl',now()),('${X}','x@x.nl',now());
  insert into public.profiles(id,email,role) values ('${MAIN}','scipio.reimeringer@gmail.com','admin'),('${OTHER}','scipreimer@gmail.com','student'),('${T2}','t2@x.nl','teacher'),('${X}','x@x.nl','student') on conflict (id) do update set role=excluded.role;`);
// MAIN teaches the other account Dutch and Portuguese; T2 also teaches the other account; MAIN also teaches student X
const st = async (teacher, email, subj, user) => (await pg.query(`insert into public.students(teacher_id,email,name,curriculum_subject,level,user_id) values ($1,$2,'Scip',$3,'A2',$4) returning id`, [teacher, email, subj, user])).rows[0].id;
const nl = await st(MAIN, 'scipreimer@gmail.com', 'nl', OTHER), pt = await st(MAIN, 'scipreimer+pt@gmail.com', 'pt', OTHER), t2 = await st(T2, 'scipreimer@gmail.com', 'es', OTHER), x = await st(MAIN, 'x@x.nl', 'nl', X);
await pg.exec(`insert into public.vocab_items(student_id,term,translation) values ('${nl}','fiets','bike'),('${pt}','praia','beach');
  insert into public.practice_sessions(student_id,user_id,kind,score,total,created_at) values ('${nl}','${OTHER}','quiz',8,10,'2026-10-01T10:00:00Z'),('${x}','${X}','quiz',5,10,now());
  insert into public.student_languages(user_id,language,level) values ('${OTHER}','fr','A1'),('${OTHER}','nl','B1'),('${MAIN}','nl','C1');`);
const count = async q => (await pg.query(q)).rows[0].n;
const before = {vocab: await count(`select count(*)::int n from public.vocab_items`), sessions: await count(`select count(*)::int n from public.practice_sessions`), students: await count(`select count(*)::int n from public.students`)};

console.log('\n=== 01 diagnose: read-only ===');
const d = await pg.query(sql('account-merge/01-diagnose.sql'));
ok(d.rows.length === 4 && d.rows[0].detail.main.role === 'admin' && d.rows[0].detail.other.role === 'student', 'shows both accounts and roles');
ok(d.rows[1].detail.length === 3 && d.rows[1].detail.every(r => r.learner_is === 'OTHER'), 'shows the three learner profiles of the other account');
ok((await count(`select count(*)::int n from public.students where user_id='${OTHER}'`)) === 3, 'nothing changed');

console.log('\n=== 02 backup ===');
await pg.exec(sql('account-merge/02-backup.sql'));
ok((await count(`select count(*)::int n from merge_backup_20261123.students`)) === 4, 'copies of the profiles');

console.log('\n=== 03 merge ===');
await pg.exec(sql('account-merge/03-merge.sql'));
ok((await count(`select count(*)::int n from public.students where user_id='${MAIN}'`)) === 3, 'the three learner profiles are linked to the main account');
ok((await count(`select count(*)::int n from public.students where user_id='${X}'`)) === 1, 'another student is untouched');
ok((await count(`select count(*)::int n from public.practice_sessions where user_id='${MAIN}' and created_at='2026-10-01T10:00:00Z'`)) === 1, 'practice results moved, original time kept');
ok((await count(`select count(*)::int n from public.vocab_items`)) === before.vocab && (await count(`select count(*)::int n from public.students`)) === before.students && (await count(`select count(*)::int n from public.practice_sessions`)) === before.sessions, 'nothing copied, nothing deleted');
ok((await count(`select count(*)::int n from public.student_languages where user_id='${MAIN}' and language='nl'`)) === 1, 'no duplicate self-study language');
ok((await count(`select count(*)::int n from public.student_languages where user_id='${MAIN}' and language='fr'`)) === 1, 'missing self-study language moved');
ok((await count(`select count(*)::int n from auth.users where id='${OTHER}'`)) === 1, 'the other account itself is NOT deleted');

console.log('\n=== 04 undo ===');
await pg.exec(sql('account-merge/04-undo.sql'));
ok((await count(`select count(*)::int n from public.students where user_id='${OTHER}'`)) === 3, 'profiles back on the other account');
ok((await count(`select count(*)::int n from public.practice_sessions where user_id='${OTHER}'`)) === 1, 'results back');
ok((await count(`select count(*)::int n from public.student_languages where user_id='${OTHER}'`)) === 2, 'self-study languages back');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
