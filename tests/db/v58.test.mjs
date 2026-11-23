// v58: a recording saved LATER (lesson left by closing the tab; saved when the teacher opens the classroom again)
// is linked to its own lesson session — by time window as before, else by its planned lesson, else by its lesson day.
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql', 'v43.sql', 'v44.sql', 'v45.sql', 'v47.sql', 'v48.sql', 'v52.sql', 'v56.sql', 'v57.sql']) await pg.exec(sql(f));
await pg.exec(sql('v58.sql')); await pg.exec(sql('v58.sql'));
ok(true, 'v58 runs (twice → idempotent)');

const T = '00000000-0000-0000-0000-0000000000a1', S = '00000000-0000-0000-0000-0000000000a2';
await pg.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${T}','t@x.nl',now()),('${S}','s@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T}','t@x.nl','teacher'),('${S}','s@x.nl','student') on conflict (id) do update set role=excluded.role;`);
const st = (await pg.query(`insert into public.students(teacher_id,email,name,curriculum_subject,user_id) values ($1,'s@x.nl','S','pt',$2) returning id`, [T, S])).rows[0].id;
const sess = async (day, start, end, lesson = null) => (await pg.query(`insert into public.lesson_sessions(student_id,teacher_id,session_key,lesson_date,started_at,ended_at,joint_seconds,registered_at,lesson_id)
  values ($1,$2,gen_random_uuid()::text,$3,$4,$5,2580,now(),$6) returning id`, [st, T, day, start, end, lesson])).rows[0].id;
const rec = async (day, createdAt, lesson = null) => (await pg.query(`insert into public.lesson_recordings(student_id,storage_path,mime_type,size_bytes,duration_seconds,teacher_consent_at,student_consent_at,created_by,lesson_date,lesson_id,created_at)
  values ($1::uuid,$1::text||'/'||$2||'-'||gen_random_uuid()::text||'.webm','audio/webm',1,1700,now(),now(),$3,$2::date,$4,$5) returning id`, [st, day, T, lesson, createdAt])).rows[0].id;
const linked = async id => (await pg.query(`select recording_id from public.lesson_sessions where id=$1`, [id])).rows[0].recording_id;

const s20 = await sess('2026-11-20', '2026-11-20 18:04+00', '2026-11-20 18:48+00');
const r20 = await rec('2026-11-20', '2026-11-20 18:36+00');
ok(await linked(s20) === r20, 'saved during the lesson: linked as before (time window)');

const s22 = await sess('2026-11-22', '2026-11-22 23:34+00', '2026-11-23 00:17+00');
const r22 = await rec('2026-11-22', '2026-11-24 09:00+00');
ok(await linked(s22) === r22, 'saved two days later (tab was closed): linked to its own lesson day');

const les = (await pg.query(`insert into public.lessons(student_id,teacher_id,starts_at,ends_at,timezone,created_by) values ($1,$2,'2026-11-26 18:00+00','2026-11-26 19:00+00','Europe/Amsterdam',$2) returning id`, [st, T])).rows[0].id;
const s26 = await sess('2026-11-26', '2026-11-26 18:00+00', '2026-11-26 19:00+00', les);
const other = await sess('2026-11-26', '2026-11-26 20:00+00', '2026-11-26 20:45+00');
const r26 = await rec('2026-11-26', '2026-11-28 09:00+00', les);
ok(await linked(s26) === r26 && !(await linked(other)), 'with a planned lesson: linked to exactly that lesson\'s session');

const r22b = await rec('2026-11-22', '2026-11-25 09:00+00');
ok(await linked(s22) === r22, 'a session that already has a recording is never overwritten');
ok((await pg.query(`select count(*)::int n from public.lesson_recordings where id=$1`, [r22b])).rows[0].n === 1, 'the extra recording itself is kept');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
