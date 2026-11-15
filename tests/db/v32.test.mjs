// v32: "languages I learn" vs "languages I teach" — teacher+student account and a separate student account (PGlite).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql']) await pg.exec(sql(f));

const SCIP = '00000000-0000-0000-0000-0000000000f1', ANA = '00000000-0000-0000-0000-0000000000f2', MAD = '00000000-0000-0000-0000-0000000000f3';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${SCIP}','scip@x.nl',now()),('${ANA}','ana@x.br',now()),('${MAD}','madison@x.com',now());
  insert into public.profiles(id,email,role) values ('${SCIP}','scip@x.nl','teacher'),('${ANA}','ana@x.br','teacher'),('${MAD}','madison@x.com','student')
   on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { const r = await q(uid, text, params); return {ok: true, rows: r.rows, n: r.affectedRows}; } catch (e) { return {ok: false, error: e.message}; } };
const LANG = `public.relation_language(curriculum_subject, subject, lesson_language)`;
// exactly the app's student-side query (lib/data.ts loadStudents with userId) + self-study languages
const learning = async uid => {
  const rel = (await q(uid, `select ${LANG} lang from public.students where user_id=$1 and teacher_id<>$1`, [uid])).rows.map(r => r.lang);
  const self = (await q(uid, `select language from public.student_languages`)).rows.map(r => r.language);
  return [...new Set([...rel, ...self])].sort().join(',');
};

// Scip teaches Dutch to Madison, and Scip himself learns Portuguese with Ana.
const MNL = (await q(SCIP, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'madison@x.com','Madison','nl') returning id`, [SCIP])).rows[0].id;
const SPT = (await q(ANA, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'scip@x.nl','Scip','pt') returning id`, [ANA])).rows[0].id;
await q(SCIP, `insert into public.lesson_entries(student_id,lesson_date,notes) values ($1,'2026-11-16','Les Madison')`, [MNL]);
// Scip also made a test student with HIS OWN e-mail address (teacher = student)
const SELF = (await q(SCIP, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'scip@x.nl','Scip test','nl') returning id`, [SCIP])).rows[0].id;

console.log('\n=== before v32: the problem ===');
ok((await q(SCIP, `select * from public.my_pending_student_links()`)).rows.some(r => r.student_id === SELF), 'reproduced: own test student shows up as an invitation in the teacher\'s own student dashboard');

console.log('\n=== v32 migration ===');
await pg.exec(sql('v32.sql')); await pg.exec(sql('v32.sql'));
ok(true, 'v32 runs (twice → idempotent)');
const pend = (await q(SCIP, `select student_id from public.my_pending_student_links()`)).rows.map(r => r.student_id);
ok(!pend.includes(SELF) && pend.includes(SPT), 'own test student no longer offered; the real invitation (Portuguese with Ana) still is');
ok(!(await tryq(SCIP, `select public.accept_student_link($1)`, [SELF])).ok, 'a teacher cannot become their own student');
await q(SCIP, `select public.accept_student_link($1)`, [SPT]);
await q(MAD, `select public.accept_student_link($1)`, [MNL]);

console.log('\n=== teacher + student account ===');
ok(await learning(SCIP) === 'pt', 'Scip learns only Portuguese — the Dutch he teaches does NOT appear in his student dashboard');
ok((await q(SCIP, `select ${LANG} lang from public.students where teacher_id=$1 and id=$2`, [SCIP, MNL])).rows[0]?.lang === 'nl', 'as a teacher Scip still sees his Dutch student Madison');
// wrongly added Dutch as self-study → safely removable
await q(SCIP, `insert into public.student_languages(language) values ('nl')`);
ok(await learning(SCIP) === 'nl,pt', 'a self-study language added by mistake shows up (only because he added it himself)');
ok((await tryq(SCIP, `delete from public.student_languages where language='nl'`)).n === 1, 'he removes the self-study entry');
ok(await learning(SCIP) === 'pt', 'Dutch gone from his own learning languages');
ok((await q(SCIP, `select notes from public.lesson_entries where student_id=$1`, [MNL])).rows[0]?.notes === 'Les Madison', 'his Dutch teaching data (Madison\'s lessons) is untouched');
ok((await q(SCIP, `select count(*)::int n from public.students where teacher_id=$1`, [SCIP])).rows[0].n === 2, 'no teacher relations were deleted');

console.log('\n=== separate student account ===');
ok(await learning(MAD) === 'nl', 'Madison (learns Dutch with Scip) sees Dutch in HER dashboard');
await q(MAD, `insert into public.student_languages(language) values ('es')`);
ok(await learning(MAD) === 'es,nl', '"+ Taal toevoegen" adds a learning language only to her own profile');
ok(await learning(SCIP) === 'pt', '… and nothing to the teacher\'s');
await q(MAD, `insert into public.student_languages(language) values ('nl')`);
await q(MAD, `delete from public.student_languages where language='nl'`);
ok(await learning(MAD) === 'es,nl', 'removing a duplicate self-study Dutch keeps Dutch from her teacher');
ok((await q(MAD, `select notes from public.lesson_entries where student_id=$1`, [MNL])).rows[0]?.notes === 'Les Madison', 'her Dutch lessons with Scip are untouched');
ok((await q(MAD, `select * from public.students where id=$1`, [SPT])).rows.length === 0, 'Madison cannot see Scip\'s own Portuguese relation');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
