// v30 agenda migration + RLS tests in real PostgreSQL (PGlite). Run: npm run test:db
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql']) await pg.exec(sql(f));

const T = '00000000-0000-0000-0000-0000000000d1', ANA = '00000000-0000-0000-0000-0000000000d2', S1 = '00000000-0000-0000-0000-0000000000d3', S2 = '00000000-0000-0000-0000-0000000000d4';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${T}','t@x.nl',now()),('${ANA}','ana@x.br',now()),('${S1}','s1@x.nl',now()),('${S2}','s2@x.nl',now());
  insert into public.profiles(id,email,role,full_name) values ('${T}','t@x.nl','teacher','Tom'),('${ANA}','ana@x.br','teacher','Ana'),('${S1}','s1@x.nl','student','Sara'),('${S2}','s2@x.nl','student','Sem')
   on conflict (id) do update set role=excluded.role, full_name=excluded.full_name;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { const r = await q(uid, text, params); return {ok: true, rows: r.rows, n: r.affectedRows}; } catch (e) { return {ok: false, error: e.message}; } };

const A = (await q(T, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'s1@x.nl','Sara','pt') returning id`, [T])).rows[0].id;
const B = (await q(T, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'s2@x.nl','Sem','nl') returning id`, [T])).rows[0].id;
const A2 = (await q(ANA, `insert into public.students(teacher_id,email,name,curriculum_subject) values ($1,'s1@x.nl','Sara','nl') returning id`, [ANA])).rows[0].id;
for (const [u, id] of [[S1, A], [S2, B], [S1, A2]]) await q(u, `select public.accept_student_link($1)`, [id]);
const REC = (await q(T, `insert into public.lesson_recordings(student_id,storage_path,mime_type,size_bytes,duration_seconds,teacher_consent_at,student_consent_at,created_by) values ($1,$2,'audio/webm',1000,25,now(),now(),$3) returning id`, [A, A + '/old.webm', T])).rows[0].id;
const before = (await pg.query(`select (select count(*) from public.students)::int s, (select count(*) from public.lesson_recordings)::int r`)).rows[0];

console.log('\n=== v30 migration ===');
await pg.exec(sql('v30.sql')); await pg.exec(sql('v30.sql'));
ok(true, 'v30 runs (twice → idempotent)');
const after = (await pg.query(`select (select count(*) from public.students)::int s, (select count(*) from public.lesson_recordings)::int r`)).rows[0];
ok(JSON.stringify(before) === JSON.stringify(after), 'existing students and recordings preserved');

console.log('\n=== Planning ===');
const one = await tryq(T, `select * from public.schedule_lessons($1, '2026-11-20 15:00', 'America/Sao_Paulo', 60, 1, 'pt', 'Focus: pretérito')`, [A]);
ok(one.ok && one.rows.length === 1, 'teacher plans a lesson');
const L1 = one.rows[0].id;
const l1 = (await q(T, `select teacher_id, to_char(starts_at at time zone 'UTC','HH24:MI') utc, to_char(ends_at - starts_at, 'HH24:MI') len from public.lessons where id=$1`, [L1])).rows[0];
ok(l1.teacher_id === T && l1.utc === '18:00' && l1.len === '01:00', 'stored as an absolute time (15:00 São Paulo = 18:00 UTC), 60 minutes');
const series = await tryq(T, `select to_char(starts_at at time zone 'Europe/Amsterdam','YYYY-MM-DD HH24:MI') local, to_char(starts_at at time zone 'UTC','HH24:MI') utc, series_id from public.schedule_lessons($1, '2026-10-18 19:00', 'Europe/Amsterdam', 45, 3)`, [B]);
ok(series.ok && series.rows.every(r => r.local.endsWith('19:00')) && series.rows.map(r => r.utc).join(',') === '17:00,18:00,18:00', 'weekly series keeps 19:00 local across the end of summer time (UTC 17:00 → 18:00)');
ok(series.ok && new Set(series.rows.map(r => r.series_id)).size === 1 && series.rows[0].series_id, 'series lessons share one series id');
ok(!(await tryq(T, `select * from public.schedule_lessons($1, '2026-11-20 10:00', 'Mars/Olympus', 60)`, [A])).ok, 'invalid time zone rejected');
ok(!(await tryq(T, `select * from public.schedule_lessons($1, '2026-11-20 10:00', 'Europe/Amsterdam', 600)`, [A])).ok, 'unrealistic duration rejected');

console.log('\n=== Double booking ===');
const dupT = await tryq(T, `select * from public.schedule_lessons($1, '2026-11-20 15:30', 'America/Sao_Paulo', 30)`, [B]);
ok(!dupT.ok && /DOUBLE_BOOKING_TEACHER/.test(dupT.error), 'teacher cannot be booked twice at the same time (other student)');
ok((await tryq(T, `select * from public.schedule_lessons($1, '2026-11-20 16:00', 'America/Sao_Paulo', 30)`, [B])).ok, 'back-to-back lesson right after is allowed');
const dupS = await tryq(ANA, `select * from public.schedule_lessons($1, '2026-11-20 18:15', 'UTC', 30)`, [A2]);
ok(!dupS.ok && /DOUBLE_BOOKING_STUDENT/.test(dupS.error), 'student account cannot have two lessons at once with different teachers');
ok(!(await tryq(T, `select * from public.schedule_lessons($1, '2026-10-25 19:00', 'Europe/Amsterdam', 45, 1)`, [B])).ok, 'a series occurrence counts as booked');
const partial = await tryq(T, `select * from public.schedule_lessons($1, '2026-11-13 15:00', 'America/Sao_Paulo', 60, 2)`, [A]);
const cnt = (await q(T, `select count(*)::int n from public.lessons where student_id=$1 and starts_at::date='2026-11-13'`, [A])).rows[0].n;
ok(!partial.ok && cnt === 0, 'series is all-or-nothing: a clash in week 2 plans nothing');
await q(T, `update public.lessons set status='cancelled' where id=$1`, [L1]);
ok((await tryq(ANA, `select * from public.schedule_lessons($1, '2026-11-20 18:15', 'UTC', 30)`, [A2])).ok, 'cancelled lesson frees the slot');
ok((await q(T, `select cancelled_at is not null c from public.lessons where id=$1`, [L1])).rows[0].c, 'cancellation time recorded');
const moved = await tryq(T, `select * from public.reschedule_lesson($1, '2026-11-21 09:00', 'Europe/Amsterdam', 90)`, [L1]);
ok(moved.ok && moved.rows[0].timezone === 'Europe/Amsterdam', 'teacher moves a lesson to another day and duration');

console.log('\n=== Who sees what ===');
const s1sees = (await q(S1, `select student_id from public.lessons`)).rows.map(r => r.student_id);
ok(s1sees.length >= 2 && s1sees.every(id => id === A || id === A2) && s1sees.includes(A) && s1sees.includes(A2), 'student sees own lessons with both teachers');
ok((await q(S2, `select * from public.lessons where student_id in ($1,$2)`, [A, A2])).rows.length === 0, 'other student sees none of them');
ok((await q(ANA, `select * from public.lessons where student_id=$1`, [A])).rows.length === 0, 'other teacher cannot see this teacher\'s lessons');
ok((await tryq(ANA, `update public.lessons set status='cancelled' where student_id=$1`, [A])).n === 0, 'other teacher cannot cancel them');
ok((await tryq(ANA, `delete from public.lessons where student_id=$1`, [A])).n === 0, 'other teacher cannot delete them');
ok((await tryq(S1, `update public.lessons set status='cancelled' where student_id=$1`, [A])).n === 0, 'student cannot change a lesson');
ok(!(await tryq(S1, `select * from public.schedule_lessons($1, '2026-12-01 10:00', 'UTC', 60)`, [A])).ok, 'student cannot plan lessons');
ok(!(await tryq(ANA, `select * from public.schedule_lessons($1, '2026-12-01 10:00', 'UTC', 60)`, [A])).ok, 'teacher cannot plan for another teacher\'s student');
ok(!(await tryq(ANA, `insert into public.lessons(student_id,teacher_id,starts_at,ends_at,created_by) values ($1,$2,'2026-12-02 10:00Z','2026-12-02 11:00Z',$2)`, [A, ANA])).ok, 'direct insert for someone else\'s relation blocked');
ok((await q(T, `select notes from public.lesson_teacher_notes where lesson_id=$1`, [L1])).rows[0]?.notes === 'Focus: pretérito', 'teacher reads own lesson notes');
ok((await q(S1, `select * from public.lesson_teacher_notes`)).rows.length === 0, 'student never sees teacher lesson notes');
ok((await q(ANA, `select * from public.lesson_teacher_notes`)).rows.length === 0, 'other teacher never sees them');

console.log('\n=== Links to the lesson ===');
const ins = (lesson) => tryq(T, `insert into public.lesson_recordings(student_id,storage_path,mime_type,size_bytes,duration_seconds,teacher_consent_at,student_consent_at,created_by,lesson_id) values ($1,$2,'audio/webm',1,1,now(),now(),$3,$4)`, [A, A + '/x-' + Math.random() + '.webm', T, lesson]);
ok((await ins(L1)).ok, 'new recording saved with a link to its lesson');
const LB = series.rows[0] && (await q(T, `select id from public.lessons where student_id=$1 limit 1`, [B])).rows[0].id;
ok(!(await ins(LB)).ok, 'cannot link a recording to another student\'s lesson');
ok(!(await tryq(T, `insert into public.lesson_analyses(student_id,recording_id,created_by) values ($1,$2,$3)`, [A, REC, T])).ok, 'analysis of an old recording still needs AI consent of both');
const c1 = await tryq(T, `select * from public.grant_ai_consent($1)`, [REC]);
ok(c1.ok && c1.rows[0].teacher_consent && !c1.rows[0].student_consent, 'teacher gives own AI consent afterwards (only their own)');
ok(!(await tryq(S2, `select * from public.grant_ai_consent($1)`, [REC])).ok, 'unrelated student cannot consent for this recording');
ok(!(await tryq(ANA, `select * from public.grant_ai_consent($1)`, [REC])).ok, 'other teacher cannot consent');
const c2 = await tryq(S1, `select * from public.grant_ai_consent($1)`, [REC]);
ok(c2.ok && c2.rows[0].teacher_consent && c2.rows[0].student_consent, 'student gives own AI consent');
ok((await tryq(T, `insert into public.lesson_analyses(student_id,recording_id,lesson_id,created_by) values ($1,$2,$3,$4)`, [A, REC, L1, T])).ok, 'with both consents the analysis can be created, linked to the lesson');

console.log('\n=== Time zones ===');
ok((await tryq(S1, `select public.set_my_timezone('America/Sao_Paulo')`)).ok && !(await tryq(S1, `select public.set_my_timezone('Nowhere/City')`)).ok, 'own time zone saved; invalid zone rejected');
await q(T, `select public.set_my_timezone('Europe/Amsterdam')`);
const tzT = (await q(T, `select * from public.people_timezones()`)).rows;
ok(tzT.some(r => r.user_id === S1 && r.timezone === 'America/Sao_Paulo') && !tzT.some(r => r.user_id === ANA), 'teacher sees the time zone of own students only');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
