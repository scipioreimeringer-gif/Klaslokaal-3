// v62: central word bank — grammar stored once, never overwritten, sources kept, practice results kept, separation.
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {sql, SUPABASE_EMULATION, MIGRATIONS, as} from './emulation.mjs';

let passes = 0, failures = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { failures++; console.log('  ✗ ' + m); } };
const pg = new PGlite({extensions: {pgcrypto}, parsers: {1082: v => v, 1184: v => v, 1114: v => v}});
await pg.exec(SUPABASE_EMULATION);
for (const f of MIGRATIONS) await pg.exec(sql(f));
for (const f of ['v26.sql', 'v27.sql', 'v28.sql', 'v29.sql', 'v30.sql', 'v31.sql', 'v32.sql', 'v33.sql', 'v34.sql', 'v35.sql', 'v38.sql', 'v40.sql', 'v43.sql', 'v44.sql', 'v45.sql', 'v46.sql', 'v47.sql', 'v48.sql']) await pg.exec(sql(f));
await pg.exec(sql('v62.sql')); await pg.exec(sql('v62.sql'));
ok(true, 'v62 runs (twice → idempotent)');
const T = '00000000-0000-0000-0000-0000000000e7', L = '00000000-0000-0000-0000-0000000000e8';
await pg.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${T}','t@x.nl',now()),('${L}','l@x.nl',now());
  insert into public.profiles(id,email,role) values ('${T}','t@x.nl','teacher'),('${L}','l@x.nl','student') on conflict (id) do update set role=excluded.role;`);
const q = (uid, text, params = []) => as(pg, uid, () => pg.query(text, params));
const st = async subj => (await pg.query(`insert into public.students(teacher_id,email,name,curriculum_subject,user_id) values ($1,gen_random_uuid()::text||'@x.nl','S',$2,$3) returning id`, [T, subj, L])).rows[0].id;
const nl = await st('nl'), pt = await st('pt');
const merge = (sid, items, day = '2026-11-24') => q(T, `select public.vocab_merge($1,$2,'canvas',$3) r`, [sid, JSON.stringify(items), day]).then(r => r.rows[0].r);
const word = async (sid, term) => (await pg.query(`select * from public.vocab_items where student_id=$1 and lower(term)=lower($2)`, [sid, term])).rows[0];

const g1 = {pos: 'verb', present: 'loopt', past_sg: 'liep', past_pl: 'liepen', participle: 'gelopen', aux: 'H/Z', conj_present: ['loop', 'loopt', 'loopt', 'lopen', 'lopen', 'lopen']};
let r = await merge(nl, [{term: 'lopen', translation: 'to walk', pos: 'ww.', grammar: g1, page: 'Oude lijst 2025'}, {term: 'het huis', translation: 'house', pos: 'znw. · het', grammar: {pos: 'noun', article: 'het', plural: 'huizen'}, page: 'Oude lijst 2025'}]);
ok(r.added === 2 && (await word(nl, 'lopen')).grammar.aux === 'H/Z', 'historical import: words with grammar into the central bank');
ok((await pg.query(`select source_page from public.vocab_lessons where student_id=$1`, [nl])).rows.every(x => x.source_page === 'Oude lijst 2025'), 'source page kept');

await pg.query(`update public.vocab_items set correct_count=5, wrong_count=2, status='practicing', translation='lopen (te voet)' where student_id=$1 and term='lopen'`, [nl]);
r = await merge(nl, [{term: 'Lopen', translation: 'to run', grammar: {pos: 'verb', aux: 'Z'}, page: 'Les 12'}], '2026-12-01');
const w = await word(nl, 'lopen');
ok(r.added === 0 && r.linked === 1, 'the same word again → recognised, no duplicate (case-insensitive)');
ok(w.correct_count === 5 && w.wrong_count === 2 && w.status === 'practicing', 'practice results are kept');
ok(w.translation === 'lopen (te voet)' && w.grammar.aux === 'H/Z', 'the teacher\'s correction and the stored grammar are never overwritten');
ok((await pg.query(`select count(*)::int n from public.vocab_lessons where vocab_id=$1`, [w.id])).rows[0].n === 2, 'the new source is added to the existing word');

await merge(pt, [{term: 'falar', translation: 'to speak', grammar: {pos: 'verb', present: 'eu falo', participle: 'falado'}}]);
ok(!(await word(nl, 'falar')) && !(await word(pt, 'lopen')), 'Dutch and Portuguese word banks stay separate');
ok(!('aux' in (await word(pt, 'falar')).grammar), 'Portuguese grammar without Dutch H/Z');
let refused = false; try { await q(L, `select public.vocab_merge($1,'[{"term":"x"}]','canvas','2026-11-24')`, [nl]); } catch { refused = true; }
ok(refused, 'only the teacher of the relation writes into it');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
