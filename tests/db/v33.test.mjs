// v33: TEST analyses from an imported transcript — admins only, never shared (PGlite).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql']) await pg.exec(sql(f));

const ADM = '00000000-0000-0000-0000-0000000000a1', TCH = '00000000-0000-0000-0000-0000000000a2', STU = '00000000-0000-0000-0000-0000000000a3';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${ADM}','admin@x.nl',now()),('${TCH}','t@x.nl',now()),('${STU}','s@x.nl',now());
  insert into public.profiles(id,email,role) values ('${ADM}','admin@x.nl','admin'),('${TCH}','t@x.nl','teacher'),('${STU}','s@x.nl','student')
   on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { const r = await q(uid, text, params); return {ok: true, rows: r.rows, n: r.affectedRows}; } catch (e) { return {ok: false, error: e.message}; } };

// the admin teaches a (test) student who is linked to a real account; a normal teacher has a student too
const AS = (await q(ADM, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'s@x.nl','Testleerling','nl') returning id`, [ADM])).rows[0].id;
await q(STU, `select public.accept_student_link($1)`, [AS]);
const TS = (await q(TCH, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'other@x.nl','Iemand','nl') returning id`, [TCH])).rows[0].id;
const before = (await pg.query(`select count(*)::int n from public.lesson_analyses`)).rows[0].n;

console.log('\n=== v33 migration ===');
await pg.exec(sql('v33.sql')); await pg.exec(sql('v33.sql'));
ok(true, 'v33 runs (twice → idempotent)');
ok((await pg.query(`select count(*)::int n from public.lesson_analyses where is_test`)).rows[0].n === 0 && before === 0, 'existing analyses are not marked as test');

console.log('\n=== who may create a TEST analysis ===');
const ins = (uid, sid, test) => tryq(uid, `insert into public.lesson_analyses(student_id,lesson_date,status,created_by,is_test,transcript) values ($1,current_date,'processing',$2,$3,'DOCENT: Hoe gaat het?\nLEERLING: Ik heb gisteren naar de markt gegaan.') returning id`, [sid, uid, test]);
const A = await ins(ADM, AS, true);
ok(A.ok, 'admin imports a test transcript for own test student');
ok(/TEST_ADMIN_ONLY/.test((await ins(TCH, TS, true)).error || ''), 'a normal teacher cannot create TEST analyses');
ok(!(await ins(ADM, TS, true)).ok, 'admin cannot attach a test to another teacher\'s student');
ok(!(await ins(STU, AS, true)).ok, 'a student cannot create analyses');

console.log('\n=== never shared ===');
const id = A.rows[0].id;
await q(ADM, `update public.lesson_analyses set status='ready', draft='{"summary":"x"}' where id=$1`, [id]);
ok(/TEST_NOT_SHAREABLE/.test((await tryq(ADM, `update public.lesson_analyses set status='approved', final='{"summary":"x"}' where id=$1`, [id])).error || ''), 'a TEST analysis can never be approved (= shared with the student)');
ok(/TEST_STAYS_TEST/.test((await tryq(ADM, `update public.lesson_analyses set is_test=false where id=$1`, [id])).error || ''), 'the TEST mark cannot be removed');
ok((await q(STU, `select * from public.student_lesson_summaries($1)`, [AS])).rows.length === 0, 'the linked student sees nothing of it');
ok((await q(STU, `select * from public.lesson_analyses`)).rows.length === 0, 'students cannot read analyses (drafts, transcript) at all');
ok((await q(TCH, `select * from public.lesson_analyses`)).rows.length === 0, 'another teacher cannot read it');
ok((await tryq(ADM, `delete from public.lesson_analyses where id=$1`, [id])).n === 1, 'admin can delete the test analysis');

console.log('\n=== real analyses unchanged ===');
const R = await ins(ADM, AS, false);
ok(R.ok, 'normal (non-test) analysis still works');
await q(ADM, `update public.lesson_analyses set status='ready', draft='{}' where id=$1`, [R.rows[0].id]);
ok((await tryq(ADM, `update public.lesson_analyses set status='approved', final='{"summary":"ok"}' where id=$1`, [R.rows[0].id])).ok, 'a real analysis can still be approved');
ok((await q(STU, `select * from public.student_lesson_summaries($1)`, [AS])).rows.length === 1, '… and then the student sees it');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
