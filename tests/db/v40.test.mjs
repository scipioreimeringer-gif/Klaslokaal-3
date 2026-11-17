// v40: translations of approved lesson summaries (PGlite, real RLS).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql']) await pg.exec(sql(f));

const T1 = '00000000-0000-0000-0000-0000000000e1', T2 = '00000000-0000-0000-0000-0000000000e2', S = '00000000-0000-0000-0000-0000000000e3', S2 = '00000000-0000-0000-0000-0000000000e4';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${T1}','t1@x.nl',now()),('${T2}','t2@x.nl',now()),('${S}','s@x.nl',now()),('${S2}','s2@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T1}','t1@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${S}','s@x.nl','student'),('${S2}','s2@x.nl','student')
   on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { const r = await q(uid, text, params); return {ok: true, rows: r.rows}; } catch (e) { return {ok: false, error: e.message}; } };

const R1 = (await q(T1, `insert into public.students(teacher_id,email,name,curriculum_subject,level) values ($1,'s@x.nl','Sofia','pt','A2') returning id`, [T1])).rows[0].id;
const R2 = (await q(T1, `insert into public.students(teacher_id,email,name,curriculum_subject,level) values ($1,'s2@x.nl','Pedro','nl','B1') returning id`, [T1])).rows[0].id;
for (const [u, r] of [[S, R1], [S2, R2]]) await q(u, `select public.accept_student_link($1)`, [r]);
const ana = async (sid, status, isTest = false) => (await q(T1, `insert into public.lesson_analyses(student_id,status,final,created_by,is_test) values ($1,$2,'{"version":2}',$3,$4) returning id`, [sid, status, T1, isTest])).rows[0].id;
const A = await ana(R1, 'approved'), DRAFT = await ana(R1, 'ready'), OTHER = await ana(R2, 'approved');
const H = 'a'.repeat(64);

console.log('\n=== v40 migration ===');
await pg.exec(sql('v40.sql')); await pg.exec(sql('v40.sql'));
ok(true, 'v40 runs (twice → idempotent)');
ok((await q(T1, `select count(*)::int n from public.lesson_analyses`)).rows[0].n === 3, 'existing analyses untouched');

console.log('\n=== who may store and read a translation ===');
const ins = (uid, id, lang = 'nl', hash = H) => tryq(uid, `insert into public.analysis_translations(analysis_id,lang,content_hash,texts) values ($1,$2,$3,'["Samenvatting"]')`, [id, lang, hash]);
ok((await ins(S, A)).ok, 'the linked student stores a translation of an approved summary');
ok((await q(S, `select texts from public.analysis_translations where analysis_id=$1`, [A])).rows[0]?.texts[0] === 'Samenvatting', '… and reads it back');
ok((await q(T1, `select * from public.analysis_translations where analysis_id=$1`, [A])).rows.length === 1, 'the teacher of the relation reads it too');
ok((await q(S2, `select * from public.analysis_translations`)).rows.length === 0, 'another student sees nothing');
ok((await q(T2, `select * from public.analysis_translations`)).rows.length === 0, 'another teacher sees nothing');
ok(!(await ins(S2, A, 'en')).ok, 'another student cannot store one for this analysis');
ok((await ins(S2, OTHER)).ok, 'a student can store one for their own approved analysis');
ok(!(await ins(S, DRAFT, 'en')).ok, 'not for a draft that is not approved yet');
ok(!(await ins(S, A)).ok, 'same language and version twice: refused (one row per version)');
ok((await ins(S, A, 'nl', 'b'.repeat(64))).ok, 'a new content version (teacher edited the text) gets its own row');
ok(!(await ins(S, A, 'xx1')).ok && !(await ins(S, A, 'nl', 'short')).ok, 'invalid language or hash refused');
ok(!(await tryq(S, `update public.analysis_translations set texts='["x"]' where analysis_id=$1`, [A])).ok || (await q(S, `select texts from public.analysis_translations where analysis_id=$1 and content_hash=$2`, [A, H])).rows[0].texts[0] === 'Samenvatting', 'translations cannot be changed afterwards');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
