// v52: Google Calendar — disconnect removes everything of the connection (never lessons/students); another Google
// account never reuses the old account's calendar, sync state, push channel or links (PGlite, real RLS).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql', 'v43.sql', 'v44.sql', 'v45.sql']) await pg.exec(sql(f));

const T1 = '00000000-0000-0000-0000-0000000000c1', S = '00000000-0000-0000-0000-0000000000c3';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${T1}','t1@x.nl',now()),('${S}','s@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T1}','t1@x.nl','teacher'),('${S}','s@x.nl','student') on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const R = (await q(T1, `insert into public.students(teacher_id,email,name,curriculum_subject,level) values ($1,'s@x.nl','Sofia','pt','A2') returning id`, [T1])).rows[0].id;
const plan = async (local, weeks = 1) => (await q(T1, `select id from public.schedule_lessons($1,$2::timestamp,'Europe/Amsterdam',60,$3)`, [R, local, weeks])).rows.map(r => r.id);
const status = async () => (await q(T1, `select public.gcal_status() s`)).rows[0].s;
const counts = async () => (await pg.query(`select (select count(*)::int from public.calendar_connections) c, (select count(*)::int from public.calendar_links) l,
  (select count(*)::int from public.calendar_outbox) o, (select count(*)::int from public.lessons) les, (select count(*)::int from public.students) st`)).rows[0];

console.log('\n=== v52 migration ===');
await pg.exec(sql('v52.sql')); await pg.exec(sql('v52.sql'));
ok(true, 'v52 runs (twice → idempotent)');

/* an old connection (the "Preply" Google account) with a calendar, links, a pending change and a push channel */
async function oldConnection() {
  await q(T1, `select public.gcal_connect('oud.preply@gmail.com','v1:OLD')`);
  await q(T1, `select public.gcal_choose_calendar('oud.preply@gmail.com','Preply')`);
  await plan('2026-12-08 10:00', 2);
  const ob = (await q(T1, `select public.gcal_outbox(100) o`)).rows[0].o;
  await q(T1, `select public.gcal_outbox_done($1,$2,$3,null)`, [ob[0].id, 'trold1', '2026-11-20T10:00:00Z']);
  await q(T1, `select public.gcal_save_state(null,false,'chan-old','res-old','hash-old','2026-12-30T00:00:00Z','ok',null)`);
}
await oldConnection();
let c = await counts(); const lessons0 = c.les;
ok(c.c === 1 && c.l >= 1 && c.o >= 1, 'old connection: token, links, pending change');

console.log('\n=== Ontkoppelen (also with withdrawn access) ===');
await q(T1, `select public.gcal_save_state(null,false,null,null,null,null,'revoked','Google heeft de toegang ingetrokken')`);
ok((await status()).status === 'revoked', 'withdrawn access is visible as such');
await q(T1, `select public.gcal_disconnect()`);
c = await counts();
ok(c.c === 0 && c.l === 0 && c.o === 0, 'token, e-mail, calendar, sync token, channel, links and pending changes removed');
ok(c.les === lessons0 && lessons0 >= 2 && c.st === 1, 'lessons and students untouched');
ok((await status()).connected === false, 'TeachyRooms shows "not connected"');
ok((await pg.query(`select public.gcal_webhook_context('chan-old','hash-old') x`)).rows[0].x === null, 'the old push channel no longer leads anywhere');
await q(T1, `update public.lessons set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where student_id=$1`, [R]);
ok((await counts()).o === 0, 'after disconnecting, changed lessons are NOT queued for Google');

console.log('\n=== another Google account never reuses the old data ===');
const lessons1 = (await counts()).les; await oldConnection(); const lessons2 = (await counts()).les;
await q(T1, `select public.gcal_connect('nieuw@gmail.com','v1:NEW')`);
const s = await status(); c = await counts();
ok(s.connected && s.email === 'nieuw@gmail.com' && s.calendar_id === null && s.push === false, 'new account: no old calendar, no old push channel');
ok(c.l === 0 && c.o === 0, 'no links to events in the old calendar, no pending changes for it');
ok((await pg.query(`select sync_token, channel_id from public.calendar_connections`)).rows.every(r => r.sync_token === null && r.channel_id === null), 'no old sync token or channel');
ok(c.les === lessons2 && lessons2 >= lessons1, 'lessons untouched');
ok((await q(T1, `select public.gcal_choose_calendar('nieuw@gmail.com','Nieuw') n`)).rows[0].n >= 1, 'choosing the new calendar queues the lessons for the NEW calendar');

console.log('\n=== the same account again keeps its calendar ===');
await q(T1, `select public.gcal_connect('NIEUW@gmail.com','v1:NEW2')`);
ok((await status()).calendar_id === 'nieuw@gmail.com', 'reconnecting the same account (any capitals) keeps the chosen calendar');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
