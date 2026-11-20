// v47: one central word list — automatic words from canvas / AI report / corrected mistakes, linked to every lesson,
// no duplicates, nothing deleted (PGlite, real RLS).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql', 'v43.sql', 'v44.sql', 'v45.sql']) await pg.exec(sql(f));

const T1 = '00000000-0000-0000-0000-0000000000d1', T2 = '00000000-0000-0000-0000-0000000000d2', S = '00000000-0000-0000-0000-0000000000d3';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${T1}','t1@x.nl',now()),('${T2}','t2@x.nl',now()),('${S}','s@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T1}','t1@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${S}','s@x.nl','student')
   on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { const r = await q(uid, text, params); return {ok: true, rows: r.rows}; } catch (e) { return {ok: false, error: e.message}; } };
const R = (await q(T1, `insert into public.students(teacher_id,email,name,curriculum_subject,level) values ($1,'s@x.nl','Sofia','nl','A2') returning id`, [T1])).rows[0].id;
await q(S, `select public.accept_student_link($1)`, [R]);
await q(T1, `insert into public.vocab_items(student_id,term,translation,lesson_date) values ($1,'de fiets','bike','2026-11-01')`, [R]);
await q(T1, `insert into public.vocab_items(student_id,term,translation) values ($1,'gezellig','')`, [R]);

console.log('\n=== v47 migration ===');
await pg.exec(sql('v47.sql')); await pg.exec(sql('v47.sql'));
ok(true, 'v47 runs (twice → idempotent)');
ok((await pg.query(`select count(*)::int n from public.vocab_items`)).rows[0].n === 2, 'existing words untouched');
ok((await pg.query(`select lesson_date from public.vocab_lessons`)).rows.map(r => r.lesson_date).join() === '2026-11-01', 'existing words linked to their lesson (copy only)');

console.log('\n=== automatic words: no duplicates, linked to every lesson ===');
const merge = (uid, items, src, day) => tryq(uid, `select public.vocab_merge($1,$2::jsonb,$3,$4) r`, [R, JSON.stringify(items), src, day]);
let r = await merge(T1, [{term: 'De fiets', translation: 'bicycle'}, {term: 'lopen', translation: 'to walk', pos: 'ww.', lang: 'nl'}, {term: 'omdat', translation: 'because', pos: 'vw.'}, {term: '  '}], 'ai', '2026-11-20');
ok(r.ok && r.rows[0].r.added === 2 && r.rows[0].r.linked === 1, 'AI report: 2 new words, 1 existing word linked (case-insensitive), empty term ignored');
ok((await pg.query(`select translation from public.vocab_items where term='de fiets'`)).rows[0].translation === 'bike', 'an existing translation is never overwritten');
r = await merge(T1, [{term: 'gezellig', translation: 'cosy', example: 'Het is gezellig.'}, {term: 'lopen', translation: 'X'}], 'canvas', '2026-11-27');
ok((await pg.query(`select translation, example from public.vocab_items where term='gezellig'`)).rows[0].translation === 'cosy', 'an empty translation is filled in');
ok((await pg.query(`select translation from public.vocab_items where term='lopen'`)).rows[0].translation === 'to walk', '…but a filled one stays');
const lessons = (await pg.query(`select l.lesson_date from public.vocab_lessons l join public.vocab_items v on v.id=l.vocab_id where v.term='lopen' order by 1`)).rows.map(x => x.lesson_date);
ok(lessons.join() === '2026-11-20,2026-11-27', 'a word that comes back keeps the link with every lesson');
r = await merge(T1, [{term: 'lopen'}], 'ai', '2026-11-27');
ok((await pg.query(`select count(*)::int n from public.vocab_lessons l join public.vocab_items v on v.id=l.vocab_id where v.term='lopen'`)).rows[0].n === 2, 'the same lesson twice = one link');
await merge(T1, [{term: 'de afspraak', translation: 'appointment', difficult: true}], 'error', '2026-11-27');
ok((await pg.query(`select difficult, source from public.vocab_items where term='de afspraak'`)).rows[0].difficult === true, 'a word from a corrected mistake is marked difficult');
ok((await pg.query(`select count(*)::int n from public.vocab_items where student_id=$1`, [R])).rows[0].n === 5, 'one row per word: 5 words in total');

console.log('\n=== rights ===');
ok(!(await merge(T2, [{term: 'hack'}], 'ai', '2026-11-27')).ok, 'another teacher cannot add words');
ok(!(await merge(S, [{term: 'zelf'}], 'ai', '2026-11-27')).ok, 'the student cannot use the automatic merge');
ok(!(await tryq(T1, `insert into public.vocab_lessons(vocab_id,student_id,lesson_date) select id, student_id, '2026-12-01' from public.vocab_items limit 1`)).ok, 'no direct writes to the links');
ok((await q(S, `select * from public.vocab_lessons`)).rows.length >= 5, 'the student reads the links of their own words');
ok((await q(T2, `select * from public.vocab_lessons`)).rows.length === 0, 'others see nothing');
await q(T1, `insert into public.vocab_items(student_id,term,lesson_date) values ($1,'handmatig','2026-12-02')`, [R]);
ok((await pg.query(`select count(*)::int n from public.vocab_lessons where lesson_date='2026-12-02'`)).rows[0].n === 1, 'a word added by hand is linked to its lesson too');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
