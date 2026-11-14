// Database security test: runs ALL Supabase migrations of this repo in a real
// PostgreSQL engine (PGlite) with a minimal emulation of Supabase's auth and
// storage schemas, then checks Row Level Security as different accounts.
// Run: npm run test:db
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sql = f => readFileSync(path.join(root, 'supabase', f), 'utf8');

let failures = 0, passes = 0;
function ok(cond, msg) { if (cond) { passes++; console.log('  ✓ ' + msg); } else { failures++; console.log('  ✗ ' + msg); } }

const SUPABASE_EMULATION = `
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage; create schema extensions;
grant usage on schema public, auth, storage, extensions to anon, authenticated;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('request.jwt.claim.email', true)) $$;
grant execute on all functions in schema auth to anon, authenticated;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid default auth.uid());
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
grant execute on all functions in schema storage to anon, authenticated;
alter table storage.objects enable row level security;
grant all on storage.objects to authenticated;
grant select on auth.users to postgres;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

async function freshDb({withV26}) {
  const db = new PGlite({extensions: {pgcrypto}});
  await db.exec(SUPABASE_EMULATION);
  for (const f of ['schema.sql', 'v21-approval.sql', 'v22-invitations.sql', 'v23-homework.sql']) await db.exec(sql(f));
  if (withV26) await db.exec(sql('v26.sql'));
  await db.exec(sql('v27.sql'));
  await db.exec(sql('v27.sql')); // must be idempotent
  return db;
}

const U = {
  scip: '00000000-0000-0000-0000-00000000000a',   // teacher Dutch AND student Portuguese
  ana: '00000000-0000-0000-0000-00000000000b',    // Portuguese teacher
  s1: '00000000-0000-0000-0000-00000000000c',     // student of Scip
  s2: '00000000-0000-0000-0000-00000000000d',     // other student of Scip
  eve: '00000000-0000-0000-0000-00000000000e',    // unverified e-mail account
};

async function as(db, uid, fn) {
  // Run fn inside a transaction as role "authenticated" with the given JWT subject.
  await db.exec('begin');
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || '']);
    await db.exec('set local role authenticated');
    const r = await fn();
    await db.exec('commit');
    return r;
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
}
async function attempt(db, uid, q, params = []) {
  try { const r = await as(db, uid, () => db.query(q, params)); return {ok: true, rows: r.rows, affected: r.affectedRows}; }
  catch (e) { return {ok: false, error: e.message}; }
}

async function seed(db) {
  await db.exec(`
    insert into auth.users(id,email,email_confirmed_at) values
      ('${U.scip}','scip@example.com',now()),('${U.ana}','ana@example.com',now()),
      ('${U.s1}','s1@example.com',now()),('${U.s2}','s2@example.com',now()),
      ('${U.eve}','eve@example.com',null);
    insert into public.profiles(id,email,role) values
      ('${U.scip}','scip@example.com','teacher'),('${U.ana}','ana@example.com','teacher'),
      ('${U.s1}','s1@example.com','student'),('${U.s2}','s2@example.com','student'),
      ('${U.eve}','eve@example.com','student')
    on conflict (id) do update set role=excluded.role;
  `);
}

async function run(label, withV26) {
  console.log(`\n=== Scenario: ${label} ===`);
  const db = await freshDb({withV26});
  ok(true, 'all migrations ran (v27 twice → idempotent)');
  await seed(db);

  // Teacher Scip creates two students; teacher Ana adds Scip as Portuguese student.
  const a = await attempt(db, U.scip, `insert into public.students(teacher_id,email,name,subject) values ($1,'s1@example.com','Student A','Nederlands') returning id, room_code`, [U.scip]);
  const b = await attempt(db, U.scip, `insert into public.students(teacher_id,email,name,subject) values ($1,'s2@example.com','Student B','Nederlands') returning id`, [U.scip]);
  const p = await attempt(db, U.ana, `insert into public.students(teacher_id,email,name,subject) values ($1,'scip@example.com','Scip','Portugees') returning id`, [U.ana]);
  ok(a.ok && b.ok && p.ok, 'teachers can add students');
  ok(a.ok && /^[0-9a-f]{20}$/.test(a.rows[0].room_code), 'new student gets a random 20-char room code');
  const A = a.rows[0].id, B = b.rows[0].id, P = p.rows[0].id;

  const forged = await attempt(db, U.s1, `insert into public.students(teacher_id,email,name) values ($1,'x@example.com','X')`, [U.s1]);
  ok(!forged.ok, 'a non-teacher cannot create student records');

  // --- consent-based linking (one account, multiple roles)
  const pend = await attempt(db, U.scip, `select * from public.my_pending_student_links()`);
  ok(pend.ok && pend.rows.length === 1 && pend.rows[0].student_id === P, 'Scip sees exactly one pending link (from Ana)');
  const steal = await attempt(db, U.s2, `select public.accept_student_link($1)`, [A]);
  ok(!steal.ok, 'student 2 cannot claim the profile of student 1');
  ok((await attempt(db, U.scip, `select public.accept_student_link($1)`, [P])).ok, 'Scip accepts being Ana\'s student');
  ok((await attempt(db, U.s1, `select public.accept_student_link($1)`, [A])).ok, 'student 1 accepts link');
  ok((await attempt(db, U.s2, `select public.accept_student_link($1)`, [B])).ok, 'student 2 accepts link');
  const evePend = await attempt(db, U.scip, `insert into public.students(teacher_id,email,name) values ($1,'eve@example.com','Eve') returning id`, [U.scip]);
  const eveLink = await attempt(db, U.eve, `select public.accept_student_link($1)`, [evePend.rows[0].id]);
  ok(!eveLink.ok, 'an account with an unverified e-mail cannot link');
  const again = await attempt(db, U.s2, `select public.accept_student_link($1)`, [A]);
  ok(!again.ok, 'an already linked profile cannot be claimed again');

  // Scip has both roles now
  const scipAsStudent = await attempt(db, U.scip, `select id from public.students where user_id=$1`, [U.scip]);
  const scipAsTeacher = await attempt(db, U.scip, `select id from public.students where teacher_id=$1`, [U.scip]);
  ok(scipAsStudent.rows.length === 1 && scipAsTeacher.rows.length === 3, 'Scip sees 1 student profile and 3 own students');
  const teachers = await attempt(db, U.scip, `select * from public.my_teachers()`);
  ok(teachers.ok && teachers.rows[0]?.teacher_name === 'ana@example.com', 'my_teachers() returns the Portuguese teacher');

  // --- classroom state
  ok((await attempt(db, U.scip, `insert into public.classroom_states(student_id,board,canvas) values ($1,'{"list":["wb:1"]}','{"pages":[]}')`, [A])).ok, 'teacher saves board for student A');
  ok((await attempt(db, U.scip, `insert into public.classroom_states(student_id,board) values ($1,'{"list":["wb:9"]}')`, [B])).ok, 'teacher saves board for student B');
  const s1Boards = await attempt(db, U.s1, `select student_id, board from public.classroom_states`);
  ok(s1Boards.ok && s1Boards.rows.length === 1 && s1Boards.rows[0].student_id === A, 'student 1 sees ONLY own board');
  const s1Write = await attempt(db, U.s1, `update public.classroom_states set board='{}' where student_id=$1`, [A]);
  ok(s1Write.ok && s1Write.affected === 0, 'student 1 cannot overwrite the stored board');
  const anaBoards = await attempt(db, U.ana, `select * from public.classroom_states`);
  ok(anaBoards.rows.length === 0, 'another teacher cannot read Scip\'s student boards');
  const anaInsert = await attempt(db, U.ana, `insert into public.classroom_states(student_id,board) values ($1,'{}') on conflict do nothing`, [B]);
  ok(!anaInsert.ok || anaInsert.affected === 0, 'another teacher cannot write a board for Scip\'s student');

  // --- lessons / vocabulary / homework text
  ok((await attempt(db, U.scip, `insert into public.lesson_entries(student_id,lesson_date,notes,words,homework) values ($1,'2026-11-10','Les A','[{"nl":"huis","uit":"house"}]','HW A')`, [A])).ok, 'teacher stores a lesson for A');
  ok((await attempt(db, U.scip, `insert into public.lesson_entries(student_id,lesson_date,notes) values ($1,'2026-11-10','Les B')`, [B])).ok, 'teacher stores a lesson for B');
  const s1Lessons = await attempt(db, U.s1, `select notes from public.lesson_entries`);
  ok(s1Lessons.rows.length === 1 && s1Lessons.rows[0].notes === 'Les A', 'student 1 reads only own lessons');
  const s2Lessons = await attempt(db, U.s2, `select notes from public.lesson_entries`);
  ok(s2Lessons.rows.length === 1 && s2Lessons.rows[0].notes === 'Les B', 'student 2 reads only own lessons');
  const s1Ins = await attempt(db, U.s1, `insert into public.lesson_entries(student_id,lesson_date) values ($1,'2026-11-11')`, [A]);
  ok(!s1Ins.ok, 'student cannot create lesson entries');
  const s1Del = await attempt(db, U.s1, `delete from public.lesson_entries where student_id=$1`, [A]);
  ok(s1Del.ok && s1Del.affected === 0, 'student cannot delete lesson entries');
  const dup = await attempt(db, U.scip, `insert into public.lesson_entries(student_id,lesson_date) values ($1,'2026-11-10') on conflict (student_id,lesson_date) do update set notes='Les A2' returning notes`, [A]);
  ok(dup.ok && dup.rows[0].notes === 'Les A2', 'upsert per student per day works');

  // --- teacher private notes
  ok((await attempt(db, U.scip, `insert into public.teacher_private_notes(student_id,notes) values ($1,'geheim')`, [A])).ok, 'teacher writes private note');
  const s1Priv = await attempt(db, U.s1, `select * from public.teacher_private_notes`);
  ok(s1Priv.ok && s1Priv.rows.length === 0, 'student can NEVER read private teacher notes');
  const scipPrivAsStudent = await attempt(db, U.ana, `select * from public.teacher_private_notes`);
  ok(scipPrivAsStudent.rows.length === 0, 'other teacher cannot read private notes');

  // --- shared text board (v26 table)
  ok((await attempt(db, U.s1, `insert into public.student_lesson_spaces(student_id,shared_board) values ($1,'hallo')`, [A])).ok, 'student writes own shared text board');
  const s2Space = await attempt(db, U.s2, `insert into public.student_lesson_spaces(student_id,shared_board) values ($1,'hack')`, [A]);
  ok(!s2Space.ok, 'student 2 cannot write into student 1\'s text board');

  // --- recordings (table + storage)
  const pathA = `${A}/rec1.webm`;
  ok((await attempt(db, U.scip, `insert into storage.objects(bucket_id,name) values ('recordings',$1)`, [pathA])).ok, 'teacher uploads recording into student A folder');
  const s1Upload = await attempt(db, U.s1, `insert into storage.objects(bucket_id,name) values ('recordings',$1)`, [`${A}/fake.webm`]);
  ok(!s1Upload.ok, 'student cannot upload recordings');
  const badPath = await attempt(db, U.scip, `insert into storage.objects(bucket_id,name) values ('recordings','not-a-uuid/x.webm')`);
  ok(!badPath.ok, 'upload outside a valid student folder is refused');
  const anaUpload = await attempt(db, U.ana, `insert into storage.objects(bucket_id,name) values ('recordings',$1)`, [`${B}/x.webm`]);
  ok(!anaUpload.ok, 'another teacher cannot upload into Scip\'s student folder');
  ok((await attempt(db, U.scip, `insert into public.lesson_recordings(student_id,storage_path,teacher_consent_at,student_consent_at,created_by) values ($1,$2,now(),now(),$3)`, [A, pathA, U.scip])).ok, 'teacher registers recording with consent timestamps');
  const noConsent = await attempt(db, U.scip, `insert into public.lesson_recordings(student_id,storage_path,teacher_consent_at,created_by) values ($1,$2,now(),$3)`, [A, `${A}/rec2.webm`, U.scip]);
  ok(!noConsent.ok, 'recording without student consent timestamp is rejected');
  const wrongFolder = await attempt(db, U.scip, `insert into public.lesson_recordings(student_id,storage_path,teacher_consent_at,student_consent_at,created_by) values ($1,$2,now(),now(),$3)`, [A, `${B}/rec3.webm`, U.scip]);
  ok(!wrongFolder.ok, 'recording path must be inside the same student folder');
  const s2Rec = await attempt(db, U.s2, `select * from public.lesson_recordings`);
  const s2Obj = await attempt(db, U.s2, `select * from storage.objects where bucket_id='recordings'`);
  ok(s2Rec.rows.length === 0 && s2Obj.rows.length === 0, 'student 2 cannot see student 1\'s recordings or files');
  const s1Obj = await attempt(db, U.s1, `select name from storage.objects where bucket_id='recordings'`);
  ok(s1Obj.rows.length === 1, 'student 1 can access own recording file');
  const s2DelRec = await attempt(db, U.s2, `delete from public.lesson_recordings where student_id=$1`, [A]);
  ok(s2DelRec.ok && s2DelRec.affected === 0, 'student 2 cannot delete student 1\'s recording');
  const s1DelRec = await attempt(db, U.s1, `delete from public.lesson_recordings where student_id=$1`, [A]);
  const s1DelObj = await attempt(db, U.s1, `delete from storage.objects where name=$1`, [pathA]);
  ok(s1DelRec.affected === 1 && s1DelObj.affected === 1, 'the recorded student may delete own recording + file');

  // --- existing data preserved
  const pre = await db.query(`select count(*)::int n from public.students where room_code is null`);
  ok(pre.rows[0].n === 0, 'every student has a room code');

  // --- students cannot alter their own record
  const tamper = await attempt(db, U.s1, `update public.students set teacher_id=$1, name='hack' where id=$2`, [U.s1, A]);
  ok(tamper.ok && tamper.affected === 0, 'student cannot modify own student record');
  await db.close();
}

// Scenario 3: existing data before v27 must survive.
async function preserveScenario() {
  console.log('\n=== Scenario: existing rows survive v27 ===');
  const db = new PGlite({extensions: {pgcrypto}});
  await db.exec(SUPABASE_EMULATION);
  for (const f of ['schema.sql', 'v21-approval.sql', 'v22-invitations.sql', 'v23-homework.sql']) await db.exec(sql(f));
  await seed(db);
  await db.exec(`insert into public.students(teacher_id,email,name,notes,history) values ('${U.scip}','old@example.com','Oude leerling','oude notities','oude geschiedenis'),('${U.scip}','old2@example.com','Oude leerling 2','','')`);
  await db.exec(sql('v27.sql'));
  const r = await db.query(`select name,notes,history,room_code,level,lesson_language from public.students order by name`);
  ok(r.rows.length === 2 && r.rows[0].notes === 'oude notities' && r.rows[0].history === 'oude geschiedenis', 'existing student data unchanged');
  ok(r.rows[0].room_code && r.rows[1].room_code && r.rows[0].room_code !== r.rows[1].room_code, 'existing students get distinct room codes');
  ok(r.rows[0].lesson_language === 'nl', 'new columns get safe defaults');
  await db.close();
}

await run('v26 ran successfully before', true);
await run('v26 never ran (syntax error)', false);
await preserveScenario();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
