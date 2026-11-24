// v60: AI memory per student — real merge (lib/memory/merge.ts) + real database functions and RLS (PGlite).
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';
import {mergeReport} from '../../lib/memory/merge.ts';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql', 'v43.sql', 'v44.sql', 'v45.sql', 'v47.sql', 'v48.sql', 'v52.sql', 'v56.sql', 'v57.sql', 'v58.sql', 'v59.sql']) await pg.exec(sql(f));
await pg.exec(sql('v60.sql')); await pg.exec(sql('v60.sql'));
ok(true, 'v60 runs (twice → idempotent)');

const T = '00000000-0000-0000-0000-0000000000c1', T2 = '00000000-0000-0000-0000-0000000000c2', L = '00000000-0000-0000-0000-0000000000c3', L2 = '00000000-0000-0000-0000-0000000000c4', ADM = '00000000-0000-0000-0000-0000000000c5';
await pg.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${T}','t@x.nl',now()),('${T2}','t2@x.nl',now()),('${L}','l@x.nl',now()),('${L2}','l2@x.nl',now()),('${ADM}','a@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T}','t@x.nl','teacher'),('${T2}','t2@x.nl','teacher'),('${L}','l@x.nl','student'),('${L2}','l2@x.nl','student'),('${ADM}','a@x.nl','admin') on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const fails = async (fn, re) => { try { await fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const st = async (teacher, user, subj, level = 'A2') => (await pg.query(`insert into public.students(teacher_id,email,name,curriculum_subject,level,user_id) values ($1,gen_random_uuid()::text||'@x.nl','S',$2,$3,$4) returning id`, [teacher, subj, level, user])).rows[0].id;
const nl = await st(T, L, 'nl'), pt = await st(T, L, 'pt'), other = await st(T, L2, 'nl'), foreign = await st(T2, L2, 'nl');
const report = async (sid, day) => (await pg.query(`insert into public.lesson_analyses(student_id,lesson_date,status,created_by,final) values ($1,$2,'approved',$3,'{"version":2}') returning id`, [sid, day, T])).rows[0].id;
const err = (original, corrected, key, label, extra = {}) => ({original, corrected, category: label, category_key: key, type: 'conjugation', certainty: 'certain', kind: 'error', repeats: 1, status: 'pending', ...extra});

/** The same steps as lib/server/memory.ts applyMemory (read → merge → memory_apply). */
async function apply(uid, sid, aid, day, doc) {
  const pats = (await q(uid, `select * from public.memory_patterns where student_id=$1`, [sid])).rows;
  const ver = (await q(uid, `select version from public.student_memory where student_id=$1`, [sid])).rows[0]?.version || 0;
  const {changed, profile} = mergeReport(pats, doc, {analysis_id: aid, lesson_date: day});
  const patterns = changed.map(({hidden, teacher_status, teacher_note, id, student_id, updated_at, ...p}) => p);
  return (await q(uid, `select public.memory_apply($1,$2,$3,$4,$5,$6) r`, [sid, aid, day, ver, JSON.stringify(patterns), JSON.stringify(profile)])).rows[0].r;
}
const pat = async (sid, key, kind = 'error') => (await pg.query(`select * from public.memory_patterns where student_id=$1 and key=$2 and kind=$3`, [sid, key, kind])).rows[0];

console.log('\n=== 1. a new lesson updates the memory (and 4. recurring errors) ===');
const a1 = await report(nl, '2026-11-01');
ok(await apply(T, nl, a1, '2026-11-01', {errors: [err('Ik heb gisteren naar school gegaan', 'Ik ben gisteren naar school gegaan', 'auxiliary', 'Hulpwerkwoord hebben/zijn', {repeats: 3})], covered: [{label: 'Voltooide tijd'}], source_quality: 'good', speakers_separated: true}) === 'applied', 'lesson 1 applied');
let p = await pat(nl, 'auxiliary');
ok(p.lessons_seen === 1 && p.occurrences === 3 && p.status === 'new' && p.examples[0].lesson_date === '2026-11-01', 'three repetitions in ONE lesson = 1 lesson, 3 occurrences, with its source lesson');
const a2 = await report(nl, '2026-11-08');
await apply(T, nl, a2, '2026-11-08', {errors: [err('Wij hebben naar huis gegaan', 'Wij zijn naar huis gegaan', 'auxiliary', 'Hulpwerkwoord hebben/zijn')], source_quality: 'good'});
p = await pat(nl, 'auxiliary');
ok(p.lessons_seen === 2 && p.status === 'learning' && p.examples.length === 2, 'lesson 2: recurring → "aan het leren", both lessons as examples');
const a3 = await report(nl, '2026-11-15');
await apply(T, nl, a3, '2026-11-15', {errors: [], covered: [{label: 'Hulpwerkwoord hebben/zijn'}], source_quality: 'good'});
p = await pat(nl, 'auxiliary');
ok(p.status === 'fair' && p.clean_lessons === 1 && p.last_clean === '2026-11-15', 'lesson 3: practised without the mistake → improvement ("redelijk beheerst"), not yet mastered after one good lesson');
const a3b = await report(nl, '2026-11-22');
await apply(T, nl, a3b, '2026-11-22', {errors: [], covered: [{label: 'Hulpwerkwoord hebben/zijn'}]});
ok((await pat(nl, 'auxiliary')).status === 'mastered', 'two clean lessons after the last mistake → "beheerst"');
const mem = (await q(T, `select profile, lessons_processed from public.student_memory where student_id=$1`, [nl])).rows[0];
ok(mem.lessons_processed === 4 && mem.profile.improved.includes('Hulpwerkwoord hebben/zijn'), 'core profile is compact and up to date (recent improvement)');

console.log('\n=== 6. the same lesson twice → no duplicates ===');
const before = await pat(nl, 'auxiliary');
ok(await apply(T, nl, a2, '2026-11-08', {errors: [err('Wij hebben naar huis gegaan', 'Wij zijn naar huis gegaan', 'auxiliary', 'Hulpwerkwoord hebben/zijn')]}) === 'duplicate', 'second apply of the same report is refused');
const after = await pat(nl, 'auxiliary');
ok(after.lessons_seen === before.lessons_seen && after.occurrences === before.occurrences && (await pg.query(`select count(*)::int n from public.memory_sources where student_id=$1`, [nl])).rows[0].n === 4, 'counts unchanged, one source row per report');
const aStale = await report(nl, '2026-11-27');
ok(await fails(() => q(T, `select public.memory_apply($1,$2,'2026-11-27',0,'[]','{}')`, [nl, aStale]), /STALE/),'an outdated base version is refused (no lost updates)');

console.log('\n=== 5. uncertain transcription / slips are no facts ===');
const a4 = await report(nl, '2026-11-29');
await apply(T, nl, a4, '2026-11-29', {errors: [err('Ik heb een hond gezien', 'Ik heb een hond gezien?', 'word_choice', 'Woordkeuze', {certainty: 'uncertain'}), err('de huis', 'het huis', 'articles', 'Lidwoorden', {kind: 'slip'})], source_quality: 'good'});
p = await pat(nl, 'word_choice');
ok(p && p.lessons_seen === 0 && p.uncertain === 1 && p.confidence === 'low', 'an uncertain observation is kept as "onzeker", not as a learning pattern');
ok(!(await pat(nl, 'articles')), 'a slip of the tongue alone creates no error pattern');
ok(!(await q(L, `select key from public.memory_focus($1)`, [nl])).rows.some(r => r.key === 'word_choice'), 'low-confidence observations are not used for practice');
const poorA = await report(nl, '2026-11-30');
await apply(T, nl, poorA, '2026-11-30', {errors: [err('x', 'y', 'prepositions', 'Voorzetsels')], source_quality: 'poor'});
ok((await pat(nl, 'prepositions')).confidence === 'low', 'poor audio quality → every observation uncertain');

console.log('\n=== 7. teacher corrections are kept ===');
await q(T, `update public.memory_patterns set teacher_status='review', hidden=false, teacher_note='blijft lastig' where student_id=$1 and key='auxiliary' and kind='error'`, [nl]);
const a5 = await report(nl, '2026-12-06');
await apply(T, nl, a5, '2026-12-06', {errors: [err('Ik heb gegaan', 'Ik ben gegaan', 'auxiliary', 'Hulpwerkwoord hebben/zijn')]});
p = await pat(nl, 'auxiliary');
ok(p.teacher_status === 'review' && p.teacher_note === 'blijft lastig' && p.lessons_seen === 3, 'the teacher\'s status and note survive a new lesson (counts still update)');
await q(T, `update public.memory_patterns set hidden=true where student_id=$1 and key='prepositions'`, [nl]);
await apply(T, nl, await report(nl, '2026-12-13'), '2026-12-13', {errors: [err('a', 'b', 'prepositions', 'Voorzetsels')]});
ok((await pat(nl, 'prepositions')).hidden === true, 'a hidden record stays hidden');
await q(T, `delete from public.memory_patterns where student_id=$1 and key='word_choice'`, [nl]);
ok(!(await pat(nl, 'word_choice')) && (await pg.query(`select count(*)::int n from public.lesson_analyses where student_id=$1`, [nl])).rows[0].n >= 8, 'deleting a memory record never deletes lessons or reports');

console.log('\n=== 2./3. no mixing between students or languages; access ===');
await apply(T, pt, await report(pt, '2026-11-02'), '2026-11-02', {errors: [err('eu é', 'eu sou', 'ser_estar', 'Ser/estar')]});
ok(!(await pat(pt, 'auxiliary')) && (await pat(pt, 'ser_estar')) && !(await pat(nl, 'ser_estar')), 'Dutch and Portuguese of the same learner stay separate');
ok(!(await pg.query(`select 1 from public.memory_patterns where student_id=$1`, [other])).rows.length, 'another student of the same teacher gets nothing');
ok((await q(T2, `select count(*)::int n from public.memory_patterns where student_id=$1`, [nl])).rows[0].n === 0, 'another teacher cannot read this memory (RLS)');
ok((await q(ADM, `select count(*)::int n from public.memory_patterns`)).rows[0].n === 0, 'admin role alone gives no access to private memory');
ok((await q(L, `select count(*)::int n from public.memory_patterns`)).rows[0].n === 0, 'the learner does not read the records (notes, examples)');
ok((await q(L, `select key, status from public.memory_focus($1)`, [nl])).rows.some(r => r.key === 'auxiliary' && r.status === 'review'), 'but the learner\'s practice gets the focus points (teacher status wins)');
ok((await q(L2, `select count(*)::int n from public.memory_focus($1)`, [nl])).rows[0].n === 0, 'and nobody else\'s');
ok(await fails(() => q(T2, `select public.memory_apply($1,$2,'2026-12-01',0,'[]','{}')`, [nl, a1]), /Not authorized/), 'another teacher cannot write into it');
ok(await fails(() => q(T, `insert into public.memory_patterns(student_id,kind,key,label) values ($1,'error','x','x')`, [nl]), /permission|denied/i), 'records are only created through memory_apply');

console.log('\n=== 8. the level never changes without the teacher ===');
await q(T, `select public.memory_propose($1,'level','B1','Gebruikt voltooide tijd en bijzinnen zeker')`, [nl]);
ok((await pg.query(`select level from public.students where id=$1`, [nl])).rows[0].level === 'A2', 'a proposal alone does not change the level');
await q(T, `select public.memory_propose($1,'level','B1','opnieuw')`, [nl]);
const prop = (await q(T, `select id from public.memory_proposals where student_id=$1 and status='pending'`, [nl])).rows;
ok(prop.length === 1, 'one pending proposal per field (no pile-up)');
ok(await fails(() => q(T2, `select public.memory_decide($1,true)`, [prop[0].id]), /Not authorized/), 'another teacher cannot accept it');
await q(T, `select public.memory_decide($1,false)`, [prop[0].id]);
await q(T, `select public.memory_propose($1,'level','B1','nog eens')`, [nl]);
ok((await q(T, `select count(*)::int n from public.memory_proposals where student_id=$1 and status='pending'`, [nl])).rows[0].n === 0, 'a rejected proposal is not repeated right away');
await q(T, `select public.memory_propose($1,'level','B2','test')`, [nl]);
await q(T, `select public.memory_decide((select id from public.memory_proposals where student_id=$1 and status='pending'),true)`, [nl]);
ok((await pg.query(`select level from public.students where id=$1`, [nl])).rows[0].level === 'B2', 'only after "Overnemen" the level changes');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
