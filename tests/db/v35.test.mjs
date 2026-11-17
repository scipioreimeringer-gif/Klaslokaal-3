// v35: word list, suggestions, taboo cache and game rounds (PGlite, real RLS).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql']) await pg.exec(sql(f));

const T1 = '00000000-0000-0000-0000-0000000000c1', T2 = '00000000-0000-0000-0000-0000000000c2', S = '00000000-0000-0000-0000-0000000000c3', S2 = '00000000-0000-0000-0000-0000000000c4';
await pg.exec(`
  insert into auth.users(id,email,email_confirmed_at) values ('${T1}','t1@x.nl',now()),('${T2}','t2@x.nl',now()),('${S}','s@x.nl',now()),('${S2}','s2@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T1}','t1@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${S}','s@x.nl','student'),('${S2}','s2@x.nl','student')
   on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const tryq = async (uid, text, params = []) => { try { const r = await q(uid, text, params); return {ok: true, rows: r.rows, n: r.affectedRows}; } catch (e) { return {ok: false, error: e.message}; } };

// Sofia: Dutch with T1 and Dutch with T2; second student Pedro: Portuguese with T1
const R1 = (await q(T1, `insert into public.students(teacher_id,email,name,curriculum_subject,level) values ($1,'s@x.nl','Sofia','nl','A2') returning id`, [T1])).rows[0].id;
const R2 = (await q(T2, `insert into public.students(teacher_id,email,name,curriculum_subject,level) values ($1,'s@x.nl','Sofia','nl','A2') returning id`, [T2])).rows[0].id;
const R3 = (await q(T1, `insert into public.students(teacher_id,email,name,curriculum_subject,level) values ($1,'s2@x.nl','Pedro','pt','A1') returning id`, [T1])).rows[0].id;
for (const [u, r] of [[S, R1], [S, R2], [S2, R3]]) await q(u, `select public.accept_student_link($1)`, [r]);
await q(T1, `insert into public.vocab_items(student_id,term,translation) values ($1,'de fiets','bike')`, [R1]);

console.log('\n=== v35 migration ===');
await pg.exec(sql('v35.sql')); await pg.exec(sql('v35.sql'));
ok(true, 'v35 runs (twice → idempotent)');
ok((await q(T1, `select term from public.vocab_items where student_id=$1`, [R1])).rows[0]?.term === 'de fiets', 'existing words unchanged');

console.log('\n=== word list ===');
const add = (uid, sid, term, extra = '') => tryq(uid, `insert into public.vocab_items(student_id,term,translation,source,lang,pos,lesson_date,source_page${extra ? ',difficult' : ''}) values ($1,$2,'x','canvas',$3,'zelfstandig naamwoord','2026-11-10','Woorden${extra ? "',true" : "'"})`, [sid, term, sid === R3 ? 'pt' : 'nl']);
ok((await add(T1, R1, 'de afspraak')).ok, 'teacher adds a canvas word with language, part of speech, lesson date and page');
ok(!(await add(T1, R1, 'De Afspraak')).ok, 'saving the same word again does not create a duplicate');
ok((await add(T1, R3, 'a saudade')).ok && (await q(T1, `select lang from public.vocab_items where student_id=$1`, [R3])).rows[0].lang === 'pt', 'second student, other target language');
ok((await q(S, `select term from public.vocab_items where student_id=$1 order by term`, [R1])).rows.map(r => r.term).join() === 'de afspraak,de fiets', 'student sees own words (also in a later lesson: stored, not per lesson)');
ok((await q(S, `select * from public.vocab_items where student_id=$1`, [R3])).rows.length === 0, 'student does not see another student\'s words');
ok((await q(T2, `select * from public.vocab_items where student_id=$1`, [R1])).rows.length === 0, 'second teacher does not see the first teacher\'s word list');
ok(!(await tryq(T1, `insert into public.vocab_items(student_id,term,source) values ($1,'x','robot')`, [R1])).ok, 'unknown source rejected');

console.log('\n=== suggestions (canvas / AI analysis) ===');
ok((await tryq(T1, `insert into public.vocab_suggestions(student_id,term,translation,origin,lesson_date,source_page) values ($1,'gezellig','cosy','canvas','2026-11-10','Woorden')`, [R1])).ok, 'teacher stores a suggestion');
ok(!(await tryq(T1, `insert into public.vocab_suggestions(student_id,term) values ($1,'Gezellig')`, [R1])).ok, 'the same word is never suggested twice (also after rejecting)');
ok((await q(S, `select * from public.vocab_suggestions`)).rows.length === 0, 'student sees no unreviewed suggestions');
ok((await q(T2, `select * from public.vocab_suggestions`)).rows.length === 0 && !(await tryq(T2, `insert into public.vocab_suggestions(student_id,term) values ($1,'x')`, [R1])).ok, 'other teacher can neither read nor add suggestions for this relation');
ok((await tryq(T1, `insert into public.vocab_canvas_scans(student_id,page_hash,found) values ($1,'p12345678ab',3)`, [R1])).ok && (await q(S, `select * from public.vocab_canvas_scans`)).rows.length === 0, 'scanned-page cache is teacher-only');

console.log('\n=== taboo cache ===');
const wid = (await q(T1, `select id from public.vocab_items where student_id=$1 and term='de afspraak'`, [R1])).rows[0].id;
ok((await tryq(T1, `insert into public.vocab_taboo(vocab_id,level,words) values ($1,'A2','{agenda,tijd,ontmoeten}')`, [wid])).ok, 'teacher caches 3 forbidden words');
ok(!(await tryq(T1, `insert into public.vocab_taboo(vocab_id,level,words) values ($1,'B1','{a,b,c,d}')`, [wid])).ok, 'more than 3 forbidden words rejected');
ok((await q(S, `select * from public.vocab_taboo`)).rows.length === 0, 'student cannot read the taboo cards');
ok((await q(T2, `select * from public.vocab_taboo`)).rows.length === 0, 'other teacher cannot read them');

console.log('\n=== game rounds: cards only for the explaining player ===');
const SESS = '11111111-1111-1111-1111-111111111111';
const R_T = '22222222-2222-2222-2222-222222222221', R_S = '22222222-2222-2222-2222-222222222222';
const cards = JSON.stringify([{vocab_id: wid, term: 'de afspraak', hint: 'x', forbidden: ['agenda']}]);
const round = (uid, id, no, explainer, sid = R1) => tryq(uid, `insert into public.game_rounds(id,student_id,session_id,round_no,kind,explainer_user_id,vocab_ids,cards,created_by) values ($1,$2,$3,$4,'taboo',$5,$6,$7,$8)`, [id, sid, SESS, no, explainer, `{${wid}}`, cards, uid]);
ok((await round(T1, R_T, 1, T1)).ok, 'teacher creates a round in which the teacher explains');
ok((await q(S, `select * from public.game_rounds where id=$1`, [R_T])).rows.length === 0, '… the guessing student cannot read its cards');
ok((await q(T1, `select cards from public.game_rounds where id=$1`, [R_T])).rows.length === 1, '… the explaining teacher can');
ok((await round(T1, R_S, 2, S)).ok, 'teacher creates a round in which the student explains (no RETURNING)');
ok((await q(T1, `select * from public.game_rounds where id=$1`, [R_S])).rows.length === 0, '… the guessing teacher cannot read its cards');
ok((await q(S, `select cards from public.game_rounds where id=$1`, [R_S])).rows[0]?.cards[0].term === 'de afspraak', '… the explaining student can');
ok(!(await round(T1, '22222222-2222-2222-2222-222222222223', 3, S2)).ok, 'explainer must be the teacher or the linked student of THIS relation');
ok(!(await round(T2, '22222222-2222-2222-2222-222222222224', 4, T2)).ok, 'another teacher cannot create rounds for this relation');
ok(!(await tryq(S, `insert into public.game_rounds(id,student_id,session_id,round_no,kind,explainer_user_id,vocab_ids,cards,created_by) values ('22222222-2222-2222-2222-222222222225',$1,$2,5,'thirty',$3,'{}','[]',$3)`, [R1, SESS, S])).ok, 'the student cannot create rounds');
ok(!(await round(T1, '22222222-2222-2222-2222-222222222226', 2, T1)).ok, 'the same round number twice is rejected (reconnect / double click)');
ok((await q(S2, `select * from public.game_rounds`)).rows.length === 0, 'another student sees nothing');
ok((await q(T1, `select public.game_used_words($1,$2) u`, [SESS, R1])).rows[0].u.length === 1, 'host knows which words were used (ids only, no repeats)');
ok((await q(S, `select public.game_used_words($1,$2) u`, [SESS, R1])).rows[0].u.length === 0, 'the student gets no list of used words');
const before = (await q(T1, `select correct_count from public.vocab_items where id=$1`, [wid])).rows[0].correct_count;
ok((await tryq(S, `select public.game_mark_guessed($1,$2)`, [R_S, wid])).ok && (await q(T1, `select correct_count from public.vocab_items where id=$1`, [wid])).rows[0].correct_count === before + 1, 'explainer marks a word as guessed → counts as practice');
ok(!(await tryq(T1, `select public.game_mark_guessed($1,$2)`, [R_S, wid])).ok, 'the guessing player cannot mark words');

console.log('\n=== AI usage kinds ===');
ok((await tryq(T1, `insert into public.ai_usage(user_id,kind,model,input_tokens,output_tokens,cost_usd) values ($1,'vocab','m',1,1,0)`, [T1])).ok && (await tryq(T1, `insert into public.ai_usage(user_id,kind,model,input_tokens,output_tokens,cost_usd) values ($1,'games','m',1,1,0)`, [T1])).ok, 'usage logging for word recognition and taboo cards');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
