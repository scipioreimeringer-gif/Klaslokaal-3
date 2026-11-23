// v56: processing state of AI reports for the student (no content) and AI consent afterwards (PGlite, real RLS).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql', 'v43.sql', 'v44.sql', 'v45.sql', 'v47.sql', 'v48.sql']) await pg.exec(sql(f));
const T = '00000000-0000-0000-0000-0000000000f1', S = '00000000-0000-0000-0000-0000000000f2', O = '00000000-0000-0000-0000-0000000000f3';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${T}','t@x.nl',now()),('${S}','esther@x.nl',now()),('${O}','o@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T}','t@x.nl','teacher'),('${S}','esther@x.nl','student'),('${O}','o@x.nl','student') on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { return {ok: true, rows: (await q(uid, text, params)).rows}; } catch (e) { return {ok: false, error: e.message}; } };
const st = (await pg.query(`insert into public.students(teacher_id,email,name,curriculum_subject,user_id) values ($1,'esther@x.nl','Esther','pt',$2) returning id`, [T, S])).rows[0].id;
const rec = async ai => (await pg.query(`insert into public.lesson_recordings(student_id,storage_path,mime_type,size_bytes,duration_seconds,teacher_consent_at,student_consent_at,created_by,lesson_date,ai_consent_teacher_at,ai_consent_student_at)
  values ($1::uuid,$1::text || '/2026-11-22-' || gen_random_uuid()::text || '.webm','audio/webm',1,2580,now(),now(),$2,'2026-11-22',${ai ? 'now()' : 'null'},${ai ? 'now()' : 'null'}) returning id`, [st, T])).rows[0].id;
const noAi = await rec(false), withAi = await rec(true);

console.log('\n=== v56 migration ===');
await pg.exec(sql('v56.sql')); await pg.exec(sql('v56.sql'));
ok(true, 'v56 runs (twice → idempotent)');
const states = async uid => (await q(uid, `select * from public.student_analysis_status($1)`, [st])).rows;
let s = await states(S);
ok(s.find(x => x.recording_id === noAi).state === 'no_consent' && s.find(x => x.recording_id === withAi).state === 'queued', 'student sees: no consent / queued (no content)');
ok((await states(O)).length === 0, 'another student sees nothing');
await pg.query(`insert into public.lesson_analyses(student_id,recording_id,lesson_date,status,created_by,stage) values ($1,$2,'2026-11-22','processing',$3,'collect')`, [st, withAi, T]);
ok((await states(S)).find(x => x.recording_id === withAi).state === 'transcribing', 'processing without transcript → transcribing');
ok(!(await tryq(S, `select transcript from public.lesson_analyses`)).rows?.length, 'the student still cannot read transcripts or drafts');

console.log('\n=== AI consent afterwards ===');
ok(!(await tryq(O, `select public.give_ai_consent($1)`, [noAi])).ok, 'never for someone else\'s recording');
ok((await q(S, `select public.give_ai_consent($1) r`, [noAi])).rows[0].r === 'waiting', 'student consents → waits for the teacher');
ok((await q(T, `select public.give_ai_consent($1) r`, [noAi])).rows[0].r === 'both', 'teacher consents → both');
ok((await states(S)).find(x => x.recording_id === noAi).state === 'queued', 'now queued for the automatic report');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
