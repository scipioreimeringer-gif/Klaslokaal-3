// v38: game rounds from the built-in word bank (PGlite, real RLS).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql']) await pg.exec(sql(f));

const T1 = '00000000-0000-0000-0000-0000000000d1', T2 = '00000000-0000-0000-0000-0000000000d2', S = '00000000-0000-0000-0000-0000000000d3', S2 = '00000000-0000-0000-0000-0000000000d4';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${T1}','t1@x.nl',now()),('${T2}','t2@x.nl',now()),('${S}','s@x.nl',now()),('${S2}','s2@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T1}','t1@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${S}','s@x.nl','student'),('${S2}','s2@x.nl','student')
   on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { const r = await q(uid, text, params); return {ok: true, rows: r.rows}; } catch (e) { return {ok: false, error: e.message}; } };

const R1 = (await q(T1, `insert into public.students(teacher_id,email,name,curriculum_subject,level) values ($1,'s@x.nl','Sofia','nl','A2') returning id`, [T1])).rows[0].id;
const R2 = (await q(T1, `insert into public.students(teacher_id,email,name,curriculum_subject,level) values ($1,'s2@x.nl','Pedro','nl','B1') returning id`, [T1])).rows[0].id;
for (const [u, r] of [[S, R1], [S2, R2]]) await q(u, `select public.accept_student_link($1)`, [r]);
const SESS = '33333333-3333-3333-3333-333333333333';
// an existing round from before v38 (personal word list)
await q(T1, `insert into public.game_rounds(id,student_id,session_id,round_no,kind,explainer_user_id,vocab_ids,cards,created_by) values ('44444444-4444-4444-4444-444444444440',$1,$2,1,'thirty',$3,'{}','[]',$3)`, [R1, SESS, T1]);

console.log('\n=== v38 migration ===');
await pg.exec(sql('v38.sql')); await pg.exec(sql('v38.sql'));
ok(true, 'v38 runs (twice → idempotent)');
ok((await q(T1, `select bank_ids from public.game_rounds where id='44444444-4444-4444-4444-444444444440'`)).rows[0]?.bank_ids.length === 0, 'existing rounds kept, with an empty bank list');

console.log('\n=== bank rounds ===');
const card = JSON.stringify([{vocab_id: null, bank_id: 'nl-de-fiets', term: 'de fiets', hint: '', forbidden: ['wiel', 'trappen', 'rijden']}]);
const round = (uid, id, no, explainer, sid = R1) => tryq(uid, `insert into public.game_rounds(id,student_id,session_id,round_no,kind,explainer_user_id,vocab_ids,bank_ids,cards,created_by) values ($1,$2,$3,$4,'taboo',$5,'{}',$6,$7,$8)`, [id, sid, SESS, no, explainer, '{nl-de-fiets,nl-de-trein}', card, uid]);
ok((await round(T1, '44444444-4444-4444-4444-444444444441', 2, S)).ok, 'teacher creates a bank round in which the student explains');
ok((await q(T1, `select * from public.game_rounds where id='44444444-4444-4444-4444-444444444441'`)).rows.length === 0, '… the guessing teacher cannot read the cards (RLS unchanged)');
ok((await q(S, `select cards from public.game_rounds where id='44444444-4444-4444-4444-444444444441'`)).rows[0]?.cards[0].term === 'de fiets', '… the explaining student can');
ok((await q(S2, `select * from public.game_rounds`)).rows.length === 0, 'another student sees nothing');
ok(!(await round(T2, '44444444-4444-4444-4444-444444444442', 3, T2)).ok, 'another teacher cannot create rounds for this relation');

console.log('\n=== used bank words (no repeats) ===');
const used = (await q(T1, `select public.game_used_bank($1,$2) u`, [SESS, R1])).rows[0].u;
ok(used.length === 2 && used.includes('nl-de-trein'), 'host gets the used bank ids (ids only, also of rounds it cannot read)');
ok((await q(S, `select public.game_used_bank($1,$2) u`, [SESS, R1])).rows[0].u.length === 0, 'the student gets an empty list');
ok((await q(T2, `select public.game_used_bank($1,$2) u`, [SESS, R1])).rows[0].u.length === 0, 'another teacher gets an empty list');
ok((await q(T1, `select public.game_used_bank($1,$2) u`, ['55555555-5555-5555-5555-555555555555', R1])).rows[0].u.length === 0, 'a new session starts fresh');
ok(!(await tryq(null, `select public.game_used_bank($1,$2)`, [SESS, R1])).ok || (await tryq(null, `select public.game_used_bank($1,$2) u`, [SESS, R1])).rows?.[0]?.u?.length === 0, 'not logged in: nothing');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
