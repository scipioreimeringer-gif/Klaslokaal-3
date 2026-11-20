// v45: Google Calendar sync — outbox, stable links, applying Google changes, conflicts, webhook checks (PGlite, real RLS).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql', 'v43.sql', 'v44.sql']) await pg.exec(sql(f));

const T1 = '00000000-0000-0000-0000-0000000000b1', T2 = '00000000-0000-0000-0000-0000000000b2', S = '00000000-0000-0000-0000-0000000000b3';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${T1}','t1@x.nl',now()),('${T2}','t2@x.nl',now()),('${S}','s@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T1}','t1@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${S}','s@x.nl','student')
   on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { const r = await q(uid, text, params); return {ok: true, rows: r.rows}; } catch (e) { return {ok: false, error: e.message}; } };
const anon = (text, params = []) => tryq(null, text, params);
const R = (await q(T1, `insert into public.students(teacher_id,email,name,curriculum_subject,level) values ($1,'s@x.nl','Sofia','pt','A2') returning id`, [T1])).rows[0].id;
await q(S, `select public.accept_student_link($1)`, [R]);
const plan = async (local, weeks = 1) => (await q(T1, `select id from public.schedule_lessons($1,$2::timestamp,'Europe/Amsterdam',60,$3)`, [R, local, weeks])).rows.map(r => r.id);
const [OLD] = await plan('2026-12-01 10:00');   // planned before connecting

console.log('\n=== v45 migration ===');
await pg.exec(sql('v45.sql')); await pg.exec(sql('v45.sql'));
ok(true, 'v45 runs (twice → idempotent)');
ok((await pg.query(`select count(*)::int n from public.lessons`)).rows[0].n === 1, 'existing lessons untouched');
const outbox = async (uid = T1) => (await q(uid, `select public.gcal_outbox(100) o`)).rows[0].o;
const status = async (uid = T1) => (await q(uid, `select public.gcal_status() s`)).rows[0].s;

console.log('\n=== connect, tokens never readable ===');
ok((await status()).connected === false, 'not connected yet');
ok(!(await tryq(T1, `select public.gcal_connect('t1@gmail.com','plain-refresh-token')`)).ok, 'a plain (unencrypted) token is refused');
ok(!(await tryq(S, `select public.gcal_connect('s@gmail.com','v1:abc')`)).ok, 'a student cannot connect a calendar');
ok((await tryq(T1, `select public.gcal_connect('t1@gmail.com','v1:CIPHERTEXT')`)).ok, 'teacher connects (ciphertext only)');
ok(!(await tryq(T1, `select * from public.calendar_connections`)).ok, 'no direct read of the token table, not even for the owner');
ok(!(await anon(`select * from public.calendar_connections`)).ok, 'anon cannot read it');
ok((await status()).connected && !('refresh_token_enc' in (await status())), 'status never contains the token');
ok((await outbox()).length === 0, 'nothing is pushed before a calendar is chosen');
ok((await q(T1, `select public.gcal_choose_calendar('primary','Mijn agenda') n`)).rows[0].n === 1, 'choosing a calendar queues existing upcoming lessons once');

console.log('\n=== TeachyRooms → Google: create, update, cancel, delete ===');
const [L2, L3] = await plan('2026-12-08 10:00', 2);
let ob = await outbox();
ok(ob.length === 3 && ob.every(o => o.op === 'upsert'), 'a new weekly series lands in the outbox (one item per lesson)');
ok(ob[0].student_name === 'Sofia' && ob[0].student_email === 's@x.nl' && ob[0].timezone === 'Europe/Amsterdam', 'outbox carries student, e-mail and time zone');
ok((await outbox(T2)).length === 0, 'another teacher sees none of it');
for (const o of ob) await q(T1, `select public.gcal_outbox_done($1,$2,$3,null)`, [o.id, 'tr' + o.lesson_id.replace(/-/g, ''), '2026-11-20T10:00:00Z']);
ok((await outbox()).length === 0, 'done → removed; link stored');
await q(T1, `update public.lessons set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where id=$1`, [L2]);
await q(T1, `update public.lessons set starts_at = starts_at + interval '30 minutes', ends_at = ends_at + interval '30 minutes' where id=$1`, [L2]);
ob = await outbox();
ok(ob.length === 1 && ob[0].lesson_id === L2, 'two edits of the same lesson = one pending update (no duplicates)');
await q(T1, `select public.gcal_outbox_done($1,$2,$3,null)`, [ob[0].id, ob[0].event_id, '2026-11-20T11:00:00Z']);
await pg.query(`update public.lessons set reminder_sent_at = now() where id=$1`, [L3]);
ok((await outbox()).length === 0, 'an internal change (reminder) does not touch Google');
await q(T1, `update public.lessons set status='cancelled' where id=$1`, [L3]);
ob = await outbox(); ok(ob.length === 1 && ob[0].status === 'cancelled', 'cancelling a lesson is sent to Google');
await q(T1, `select public.gcal_outbox_done($1,$2,$3,null)`, [ob[0].id, ob[0].event_id, '2026-11-20T12:00:00Z']);
const tmp = (await plan('2026-12-30 10:00'))[0]; ob = await outbox();
await q(T1, `select public.gcal_outbox_done($1,$2,$3,null)`, [ob[0].id, 'tr' + tmp.replace(/-/g, ''), '2026-11-20T12:00:00Z']);
await q(T1, `delete from public.lessons where id=$1`, [tmp]);
ob = await outbox(); ok(ob.length === 1 && ob[0].op === 'delete' && ob[0].event_id === 'tr' + tmp.replace(/-/g, ''), 'deleting a lesson deletes its Google event (event id kept for the delete)');
await q(T1, `select public.gcal_outbox_done($1,null,null,null)`, [ob[0].id]);
await q(T1, `select public.gcal_outbox_done(999999,null,null,'x')`);
ok(true, 'unknown outbox id is ignored');

console.log('\n=== Google → TeachyRooms ===');
const ev = (id, p) => ({id: 'tr' + id.replace(/-/g, ''), status: 'confirmed', ...p});
let r = (await q(T1, `select public.gcal_apply($1::jsonb,'SYNC1') r`, [JSON.stringify([ev(L2, {start: '2026-12-08T12:00:00-03:00', end: '2026-12-08T13:00:00-03:00', tz: 'America/Sao_Paulo', updated: '2026-11-21T09:00:00Z'})])])).rows[0].r;
let l2 = (await pg.query(`select starts_at, timezone from public.lessons where id=$1`, [L2])).rows[0];
ok(r.applied === 1 && new Date(l2.starts_at).toISOString() === '2026-12-08T15:00:00.000Z' && l2.timezone === 'America/Sao_Paulo', 'moving the event in Google moves the lesson (instant + time zone)');
ok((await outbox()).length === 0, 'applying a Google change does not echo back (no loop)');
r = (await q(T1, `select public.gcal_apply($1::jsonb,null) r`, [JSON.stringify([ev(L2, {start: '2026-12-08T09:00:00Z', end: '2026-12-08T10:00:00Z', updated: '2026-11-21T09:00:00Z'})])])).rows[0].r;
ok(r.skipped === 1, 'the same Google version again is skipped (repeat sync = no change)');
r = (await q(T1, `select public.gcal_apply($1::jsonb,null) r`, [JSON.stringify([{id: 'someprivateevent', status: 'confirmed', start: '2026-12-09T09:00:00Z', end: '2026-12-09T10:00:00Z', updated: '2026-11-21T10:00:00Z'}])])).rows[0].r;
ok(r.skipped === 1 && (await pg.query(`select count(*)::int n from public.lessons`)).rows[0].n === 3, 'other events in the teacher\'s calendar are never imported');
await q(T1, `update public.lessons set ends_at = ends_at + interval '15 minutes' where id=$1`, [L2]);
r = (await q(T1, `select public.gcal_apply($1::jsonb,null) r`, [JSON.stringify([ev(L2, {start: '2026-12-08T18:00:00Z', end: '2026-12-08T19:00:00Z', updated: '2026-11-21T11:00:00Z'})])])).rows[0].r;
l2 = (await pg.query(`select starts_at from public.lessons where id=$1`, [L2])).rows[0];
ok(r.conflicts === 1 && new Date(l2.starts_at).toISOString() === '2026-12-08T15:00:00.000Z', 'simultaneous change: the pending TeachyRooms change wins, Google gets it');
ob = await outbox(); await q(T1, `select public.gcal_outbox_done($1,$2,$3,null)`, [ob[0].id, ob[0].event_id, '2026-11-21T11:30:00Z']);
r = (await q(T1, `select public.gcal_apply($1::jsonb,null) r`, [JSON.stringify([ev(L2, {start: '2026-12-01T09:00:00Z', end: '2026-12-01T10:00:00Z', updated: '2026-11-21T12:00:00Z'})])])).rows[0].r;
l2 = (await pg.query(`select starts_at from public.lessons where id=$1`, [L2])).rows[0];
ok(r.conflicts === 1 && new Date(l2.starts_at).toISOString() === '2026-12-08T15:00:00.000Z', 'a move onto another lesson (double booking) is refused…');
ok((await outbox()).some(o => o.lesson_id === L2) && /overlapt/.test((await status()).last_error), '…the TeachyRooms version is written back and the teacher sees why');
ob = await outbox(); await q(T1, `select public.gcal_outbox_done($1,$2,$3,null)`, [ob[0].id, ob[0].event_id, '2026-11-21T12:30:00Z']);
r = (await q(T1, `select public.gcal_apply($1::jsonb,null) r`, [JSON.stringify([ev(L2, {all_day: true, updated: '2026-11-21T13:00:00Z'})])])).rows[0].r;
ok(r.conflicts === 1, 'an all-day event is not taken over');
ob = await outbox(); await q(T1, `select public.gcal_outbox_done($1,$2,$3,null)`, [ob[0].id, ob[0].event_id, '2026-11-21T13:30:00Z']);
r = (await q(T1, `select public.gcal_apply($1::jsonb,null) r`, [JSON.stringify([ev(L2, {status: 'cancelled', updated: '2026-11-21T14:00:00Z'})])])).rows[0].r;
ok(r.applied === 1 && (await pg.query(`select status from public.lessons where id=$1`, [L2])).rows[0].status === 'cancelled', 'deleting/cancelling the event in Google cancels the lesson (data kept)');
r = (await q(T1, `select public.gcal_apply($1::jsonb,null) r`, [JSON.stringify([ev(OLD, {start: '2026-12-01T09:30:00Z', end: '2026-12-01T10:30:00Z', summary: 'Portugees met Sofia', description: 'Hoofdstuk 3', updated: '2026-11-21T15:00:00Z'})])])).rows[0].r;
const old = (await pg.query(`select title, description from public.lessons where id=$1`, [OLD])).rows[0];
ok(old.title === 'Portugees met Sofia' && old.description === 'Hoofdstuk 3', 'title and description from Google are kept');
ok(!(await tryq(T2, `select public.gcal_apply($1::jsonb,null)`, [JSON.stringify([ev(OLD, {status: 'cancelled', updated: '2026-11-22T00:00:00Z'})])])).ok, 'another teacher (not connected) cannot apply anything');
ok((await pg.query(`select status from public.lessons where id=$1`, [OLD])).rows[0].status === 'scheduled', '…and the lesson is unchanged');

console.log('\n=== push notifications (webhook) ===');
await q(T1, `select public.gcal_save_state(null,false,'chan-1','res-1','hash-abc','2026-12-01T00:00:00Z','ok',null)`);
ok((await anon(`select public.gcal_webhook_context('chan-1','wrong') c`)).rows[0].c === null, 'wrong channel token → nothing');
const ctx = (await anon(`select public.gcal_webhook_context('chan-1','hash-abc') c`)).rows[0].c;
ok(ctx && ctx.refresh_enc === 'v1:CIPHERTEXT' && ctx.sync_token === 'SYNC1', 'right channel token → encrypted token + sync token (key stays on the server)');
ok(!(await anon(`select public.gcal_webhook_apply('chan-1','wrong','[]'::jsonb,null,null)`)).ok, 'webhook apply with a wrong token is refused');
r = (await anon(`select public.gcal_webhook_apply('chan-1','hash-abc',$1::jsonb,'SYNC2',null) r`, [JSON.stringify([ev(OLD, {start: '2026-12-01T11:00:00Z', end: '2026-12-01T12:00:00Z', updated: '2026-11-21T16:00:00Z'})])])).rows[0].r;
ok(r.applied === 1 && (await anon(`select public.gcal_webhook_context('chan-1','hash-abc') c`)).rows[0].c.sync_token === 'SYNC2', 'webhook applies changes and stores the new sync token');
ok(!(await anon(`select public.gcal_apply('[]'::jsonb,null)`)).ok && (await anon(`select public.gcal_outbox(10) o`)).rows[0].o.length === 0, 'without a user nothing can be applied and no outbox is visible');

console.log('\n=== revoked token, reconnect, disconnect ===');
await anon(`select public.gcal_webhook_apply('chan-1','hash-abc','[]'::jsonb,null,'revoked')`);
ok((await status()).status === 'revoked', 'a revoked Google token is shown to the teacher');
ok((await anon(`select public.gcal_webhook_context('chan-1','hash-abc') c`)).rows[0].c === null, 'no more webhook work while revoked');
await q(T1, `select public.gcal_connect('t1@gmail.com','v1:NEWCIPHERTEXT')`);
const st = await status();
ok(st.status === 'ok' && st.calendar_id === 'primary', 'reconnecting keeps the chosen calendar');
ok((await pg.query(`select count(*)::int n from public.calendar_links where teacher_id=$1`, [T1])).rows[0].n >= 3, '…and the event links (no duplicates after reconnect)');
await q(T1, `select public.gcal_disconnect()`);
ok((await status()).connected === false && (await pg.query(`select count(*)::int n from public.calendar_links`)).rows[0].n === 0, 'disconnect removes the connection and links');
ok((await pg.query(`select count(*)::int n from public.lessons`)).rows[0].n === 3, '…lessons stay');
await q(T1, `update public.lessons set title='na ontkoppelen' where id=$1`, [OLD]);
ok((await pg.query(`select count(*)::int n from public.calendar_outbox`)).rows[0].n === 0, 'after disconnect nothing is queued');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
