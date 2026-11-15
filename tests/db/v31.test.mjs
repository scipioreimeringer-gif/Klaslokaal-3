// v31: learning languages per student (Dutch first) — the required scenarios in real PostgreSQL (PGlite).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql']) await pg.exec(sql(f));

const SCIP = '00000000-0000-0000-0000-0000000000e1', ANA = '00000000-0000-0000-0000-0000000000e2', KIM = '00000000-0000-0000-0000-0000000000e3';
const NL1 = '00000000-0000-0000-0000-0000000000e4', BOTH = '00000000-0000-0000-0000-0000000000e5', OTHER = '00000000-0000-0000-0000-0000000000e6';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${SCIP}','scip@x.nl',now()),('${ANA}','ana@x.br',now()),('${KIM}','kim@x.nl',now()),('${NL1}','nl1@x.nl',now()),('${BOTH}','both@x.nl',now()),('${OTHER}','other@x.nl',now());
  insert into public.profiles(id,email,role) values ('${SCIP}','scip@x.nl','teacher'),('${ANA}','ana@x.br','teacher'),('${KIM}','kim@x.nl','teacher'),('${NL1}','nl1@x.nl','student'),('${BOTH}','both@x.nl','student'),('${OTHER}','other@x.nl','student')
   on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { const r = await q(uid, text, params); return {ok: true, rows: r.rows, n: r.affectedRows}; } catch (e) { return {ok: false, error: e.message}; } };
const LANG = `public.relation_language(curriculum_subject, subject, lesson_language)`;
const myLangs = async uid => (await q(uid, `select ${LANG} lang, teacher_id from public.students where user_id=$1 order by lang, teacher_id`, [uid])).rows;

// existing situation before v31: a Portuguese relation (Ana teaches BOTH) with lesson data
const PT = (await q(ANA, `insert into public.students(teacher_id,email,name,subject) values ($1,'both@x.nl','Bo','Portugees') returning id`, [ANA])).rows[0].id;
await q(BOTH, `select public.accept_student_link($1)`, [PT]);
await q(ANA, `insert into public.lesson_entries(student_id,lesson_date,notes) values ($1,'2026-11-10','Aula de português')`, [PT]);
// a relation whose language was only derived from the classroom "Lestaal" (no explicit language)
const MIS = (await q(SCIP, `insert into public.students(teacher_id,email,name,lesson_language) values ($1,'nl1@x.nl','Nina','pt') returning id`, [SCIP])).rows[0].id;
await q(NL1, `select public.accept_student_link($1)`, [MIS]);
await q(SCIP, `insert into public.lesson_entries(student_id,lesson_date,notes) values ($1,'2026-11-12','Les 1')`, [MIS]);

console.log('\n=== v31 migration ===');
await pg.exec(sql('v31.sql')); await pg.exec(sql('v31.sql'));
ok(true, 'v31 runs (twice → idempotent)');

console.log('\n=== Scenario 1: one student with Dutch ===');
ok((await myLangs(NL1))[0].lang === 'pt', 'cause reproduced: relation without explicit language follows the classroom "Lestaal" (pt) → shown as Portuguese');
ok((await tryq(SCIP, `update public.students set curriculum_subject='nl' where id=$1`, [MIS])).n === 1, 'teacher sets the language explicitly to Dutch');
ok((await myLangs(NL1)).map(r => r.lang).join() === 'nl', 'student now sees Dutch');
ok((await q(NL1, `select notes from public.lesson_entries where student_id=$1`, [MIS])).rows[0]?.notes === 'Les 1', 'existing lesson data kept');

console.log('\n=== Scenario 2/4: Dutch AND Portuguese; teacher adds Dutch to an existing student ===');
// Scip teaches BOTH Dutch: new relation by e-mail → invitation, accept → linked
const NLB = (await q(SCIP, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'both@x.nl','Bo','nl') returning id`, [SCIP])).rows[0].id;
ok((await q(BOTH, `select * from public.my_pending_student_links()`)).rows.some(r => r.student_id === NLB), 'student sees the Dutch invitation after logging in');
await q(BOTH, `select public.accept_student_link($1)`, [NLB]);
ok((await myLangs(BOTH)).map(r => r.lang).join() === 'nl,pt', 'student has Dutch (Scip) and Portuguese (Ana)');
// teacher adds French to an already linked student: linked automatically, separate data
const FR = await tryq(SCIP, `select public.teacher_add_language($1,'fr') id`, [NLB]);
ok(FR.ok, 'teacher adds a language to an existing student');
ok((await myLangs(BOTH)).map(r => r.lang).join() === 'fr,nl,pt', 'new language appears for the student without a new invitation (same teacher, already accepted)');
ok((await q(SCIP, `select count(*)::int n from public.lesson_entries where student_id=$1`, [FR.rows[0].id])).rows[0].n === 0, 'new language starts with its own, empty lesson data');
ok(!(await tryq(SCIP, `select public.teacher_add_language($1,'nl')`, [NLB])).ok, 'same teacher + same language twice is rejected');
ok(/LANGUAGE_EXISTS/.test((await tryq(SCIP, `select public.teacher_add_language($1,'nl')`, [NLB])).error || ''), '… with a recognisable message');
ok(!(await tryq(ANA, `select public.teacher_add_language($1,'de')`, [NLB])).ok, 'another teacher cannot add languages to this teacher\'s student');
ok(!(await tryq(BOTH, `select public.teacher_add_language($1,'de')`, [NLB])).ok, 'a student cannot add relations this way');
ok(!(await tryq(SCIP, `select public.teacher_add_language($1,'dutch')`, [NLB])).ok, 'invalid language code rejected');
// unlinked source → new relation stays unlinked (student must accept the invitation)
const UN = (await q(SCIP, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'new@x.nl','Nieuw','pt') returning id`, [SCIP])).rows[0].id;
const UNNL = (await q(SCIP, `select public.teacher_add_language($1,'nl') id`, [UN])).rows[0].id;
ok((await q(SCIP, `select user_id from public.students where id=$1`, [UNNL])).rows[0].user_id === null, 'unlinked student: the added language waits for the invitation to be accepted');

console.log('\n=== Scenario 3: one student with two teachers for Dutch ===');
const KNL = (await q(KIM, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'both@x.nl','Bo','nl') returning id`, [KIM])).rows[0].id;
await q(BOTH, `select public.accept_student_link($1)`, [KNL]);
const nlRel = (await myLangs(BOTH)).filter(r => r.lang === 'nl');
ok(nlRel.length === 2 && new Set(nlRel.map(r => r.teacher_id)).size === 2, 'student has Dutch with two different teachers');
await q(KIM, `insert into public.lesson_entries(student_id,lesson_date,notes) values ($1,'2026-11-13','Kim les')`, [KNL]);
ok((await q(SCIP, `select * from public.lesson_entries where student_id=$1`, [KNL])).rows.length === 0, 'Scip cannot read Kim\'s Dutch lessons with the same student');
ok((await q(KIM, `select * from public.lesson_entries where student_id=$1`, [NLB])).rows.length === 0, 'Kim cannot read Scip\'s Dutch lessons');

console.log('\n=== Scenario 5: log in as student and open the Dutch classroom ===');
const room = (await q(BOTH, `select id, room_code, ${LANG} lang from public.students where id=$1`, [NLB])).rows[0];
ok(room && room.lang === 'nl' && room.room_code, 'student can open their Dutch classroom (relation + room code readable)');
ok((await q(OTHER, `select * from public.students where id in ($1,$2,$3)`, [NLB, PT, KNL])).rows.length === 0, 'another student sees none of these relations');
ok((await q(OTHER, `select * from public.lesson_entries where student_id in ($1,$2)`, [NLB, PT])).rows.length === 0, 'another student sees none of their lesson data');
ok((await q(NL1, `select * from public.students where id=$1`, [NLB])).rows.length === 0, 'students never see each other\'s relations');
ok((await q(BOTH, `select notes from public.lesson_entries where student_id=$1`, [PT])).rows[0]?.notes === 'Aula de português', 'existing Portuguese profile keeps working');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
