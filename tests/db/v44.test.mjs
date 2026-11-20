// v44: homework deadline + level per word (PGlite, real RLS).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql', 'v43.sql']) await pg.exec(sql(f));

const T1 = '00000000-0000-0000-0000-0000000000a1', T2 = '00000000-0000-0000-0000-0000000000a2', S = '00000000-0000-0000-0000-0000000000a3';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${T1}','t1@x.nl',now()),('${T2}','t2@x.nl',now()),('${S}','s@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T1}','t1@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${S}','s@x.nl','student')
   on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { const r = await q(uid, text, params); return {ok: true, rows: r.rows}; } catch (e) { return {ok: false, error: e.message}; } };
const R = (await q(T1, `insert into public.students(teacher_id,email,name,curriculum_subject,level) values ($1,'s@x.nl','Sofia','pt','A2') returning id`, [T1])).rows[0].id;
await q(S, `select public.accept_student_link($1)`, [R]);
await q(T1, `insert into public.vocab_items(student_id,term) values ($1,'a casa')`, [R]);
const A = (await pg.query(`insert into public.assignments(student_id,title,instructions,published_at) values ($1,'Oefening','Doe dit',now()) returning id`, [R])).rows[0].id; // fixture (as admin)

console.log('\n=== v44 migration ===');
await pg.exec(sql('v44.sql')); await pg.exec(sql('v44.sql'));
ok(true, 'v44 runs (twice → idempotent)');
ok((await pg.query(`select level from public.vocab_items where term='a casa'`)).rows[0].level === 'A2', 'existing words get the level of their relation');
ok((await pg.query(`select count(*)::int n, max(title) t from public.assignments`)).rows[0].t === 'Oefening', 'existing assignments untouched');

console.log('\n=== new words and deadlines ===');
await q(T1, `insert into public.vocab_items(student_id,term) values ($1,'o livro')`, [R]);
ok((await pg.query(`select level from public.vocab_items where term='o livro'`)).rows[0].level === 'A2', 'a new word gets the current level automatically');
await q(T1, `insert into public.vocab_items(student_id,term,level) values ($1,'a saudade','B2')`, [R]);
ok((await pg.query(`select level from public.vocab_items where term='a saudade'`)).rows[0].level === 'B2', 'an explicit level is kept');
ok(!(await tryq(T1, `insert into public.vocab_items(student_id,term,level) values ($1,'x','Z9')`, [R])).ok, 'invalid level refused');
ok(!(await tryq(T1, `insert into public.vocab_items(student_id,term) values ($1,'A Casa')`, [R])).ok, 'still one entry per word (no double storage)');
ok((await tryq(T1, `update public.assignments set due_at = now() + interval '7 days' where id=$1`, [A])).ok, 'the teacher sets a deadline');
ok((await q(S, `select due_at from public.assignments where id=$1`, [A])).rows[0]?.due_at, 'the linked student sees the deadline');
const other = await tryq(T2, `update public.assignments set due_at = now() where id=$1 returning id`, [A]);
ok(!other.ok || other.rows.length === 0, 'another teacher cannot change it');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
