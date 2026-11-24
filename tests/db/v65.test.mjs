// v65: import progress of big word lists — stored per student and page, only the student's teacher can see/change it.
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql']) await pg.exec(sql(f));
await pg.exec(sql('v65.sql')); await pg.exec(sql('v65.sql'));
ok(true, 'v65 runs (twice → idempotent)');
const T = '00000000-0000-0000-0000-0000000000b7', T2 = '00000000-0000-0000-0000-0000000000b8', L = '00000000-0000-0000-0000-0000000000b9';
await pg.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${T}','t@x.nl',now()),('${T2}','t2@x.nl',now()),('${L}','l@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T}','t@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${L}','l@x.nl','student') on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const s1 = (await pg.query(`insert into public.students(teacher_id,email,name,user_id) values ($1,'a@x.nl','S',$2) returning id`, [T, L])).rows[0].id;
await q(T, `insert into public.vocab_import_progress(student_id,page_hash,total,next_offset,added) values ($1,'p1',1200,400,380)`, [s1]);
await q(T, `insert into public.vocab_import_progress(student_id,page_hash,total,next_offset,added) values ($1,'p1',1200,440,410) on conflict (student_id,page_hash) do update set next_offset=excluded.next_offset, added=excluded.added`, [s1]);
const r = (await q(T, `select next_offset, added, status from public.vocab_import_progress where student_id=$1`, [s1])).rows;
ok(r.length === 1 && r[0].next_offset === 440 && r[0].status === 'running', 'one progress row per page, continues where it stopped');
ok((await q(T2, `select count(*)::int n from public.vocab_import_progress`)).rows[0].n === 0 && (await q(L, `select count(*)::int n from public.vocab_import_progress`)).rows[0].n === 0, 'only the teacher of this student sees it');
let refused = false; try { await q(T2, `insert into public.vocab_import_progress(student_id,page_hash) values ($1,'x')`, [s1]); } catch { refused = true; }
ok(refused, 'another teacher cannot write progress for this student');
console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
