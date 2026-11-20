// v46: Canvas images in private Storage — who may read, add and delete (PGlite, real RLS on storage.objects).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql', 'v43.sql', 'v44.sql', 'v45.sql']) await pg.exec(sql(f));
await pg.exec(`alter table storage.objects enable row level security; grant select, insert, delete on storage.objects to authenticated;`);

const T1 = '00000000-0000-0000-0000-0000000000c1', T2 = '00000000-0000-0000-0000-0000000000c2', S = '00000000-0000-0000-0000-0000000000c3', S2 = '00000000-0000-0000-0000-0000000000c4';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${T1}','t1@x.nl',now()),('${T2}','t2@x.nl',now()),('${S}','s@x.nl',now()),('${S2}','s2@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T1}','t1@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${S}','s@x.nl','student'),('${S2}','s2@x.nl','student')
   on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { const r = await q(uid, text, params); return {ok: true, rows: r.rows}; } catch (e) { return {ok: false, error: e.message}; } };
const R = (await q(T1, `insert into public.students(teacher_id,email,name) values ($1,'s@x.nl','Sofia') returning id`, [T1])).rows[0].id;
const R2 = (await q(T1, `insert into public.students(teacher_id,email,name) values ($1,'s2@x.nl','Pedro') returning id`, [T1])).rows[0].id;
for (const [u, r] of [[S, R], [S2, R2]]) await q(u, `select public.accept_student_link($1)`, [r]);

console.log('\n=== v46 migration ===');
await pg.exec(sql('v46.sql')); await pg.exec(sql('v46.sql'));
ok(true, 'v46 runs (twice → idempotent)');
const b = (await pg.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id='canvas-images'`)).rows[0];
ok(b && b.public === false && +b.file_size_limit === 5242880 && b.allowed_mime_types.length === 4, 'private bucket, 5 MB, JPG/PNG/WebP/GIF only');

console.log('\n=== who may add, read and delete ===');
const name = (sid, h = 'a') => `${sid}/${h.repeat(64)}.png`;
const add = (uid, n) => tryq(uid, `insert into storage.objects(bucket_id,name) values ('canvas-images',$1)`, [n]);
ok((await add(T1, name(R))).ok, 'teacher adds an image to the student\'s Canvas');
ok((await add(S, name(R, 'b'))).ok, 'the linked student adds an image to their own Canvas');
ok(!(await add(S2, name(R, 'c'))).ok, 'another student cannot add to this Canvas');
ok(!(await add(T2, name(R, 'd'))).ok, 'another teacher cannot add to this Canvas');
ok(!(await add(T1, `${R}/evil.svg`)).ok && !(await add(T1, `${R}/../x.png`)).ok, 'only <student>/<sha256>.<png|jpg|webp|gif> names (no SVG, no tricks)');
const read = async uid => (await q(uid, `select name from storage.objects where bucket_id='canvas-images'`)).rows.length;
ok(await read(T1) === 2 && await read(S) === 2, 'teacher and student read the images of this Canvas');
ok(await read(S2) === 0 && await read(T2) === 0, 'others see nothing');
ok((await q(S, `delete from storage.objects where name=$1 returning name`, [name(R)])).rows.length === 0, 'the student cannot delete');
ok((await q(T1, `delete from storage.objects where name=$1 returning name`, [name(R)])).rows.length === 1, 'the teacher can delete');
ok((await pg.query(`select count(*)::int n from storage.objects where bucket_id='recordings'`)).rows[0].n === 0, 'other buckets unaffected');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
