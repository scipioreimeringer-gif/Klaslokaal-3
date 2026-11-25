// v51: grammar-focused daily practice (NL + PT-BR), deduplicated report errors, settings menu + student link.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildDaily, checkAnswer, mixFor, uniqueMistakes} from '../../lib/daily.ts';
import {grammarBank} from '../../lib/grammar.ts';
import {dedupeErrors, sameError, groupErrors, errorsOf} from '../../lib/analysis/core.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const NOW = Date.parse('2026-11-21T09:00:00Z');
const W = (n, term, tr, ex = '') => ({id: 'w' + n, term, translation: tr, example: ex, pos: '', status: 'new', due_at: '2026-11-20T00:00:00Z', wrong_count: 0, streak: 0, last_practiced_at: null});
const ptWords = [W(1, 'a praia', 'het strand', 'Nós fomos à praia ontem.'), W(2, 'cansado', 'moe', 'Estou muito cansado hoje.'), W(3, 'o mercado', 'de markt'), W(4, 'a viagem', 'de reis'), W(5, 'sempre', 'altijd')];
const M = (n, o, c, label, repeats = 1, extra = {}) => ({key: 'err:a:e' + n, original: o, corrected: c, why: '', type: 'conjugation', label, repeats, lesson_date: '2026-11-19', ...extra});
const ptMistakes = [M(1, 'Ontem eu vou ao mercado', 'Ontem eu fui ao mercado', 'Pretérito perfeito', 5), M(2, 'Ontem eu vou ao mercado.', 'ontem eu fui ao mercado', 'Pretérito perfeito'), M(3, 'Eu sou cansado', 'Eu estou cansado', 'Ser of estar', 2)];
const set = (level, lang, extra = {}) => buildDaily({studentId: 's1', day: '2026-11-21', level, lang, words: lang === 'pt' ? ptWords : [], mistakes: lang === 'pt' ? ptMistakes : [], homework: [], state: [], now: NOW, ...extra});
const days = (level, lang, n = 10, extra = {}) => Array.from({length: n}, (_, d) => buildDaily({studentId: 's1', day: `2026-11-${String(d + 1).padStart(2, '0')}`, level, lang, words: lang === 'pt' ? ptWords : [], mistakes: lang === 'pt' ? ptMistakes : [], homework: [], state: [], now: NOW, ...extra}));

test('A1 gets simple exercises: recognition, present tense, no free writing, nothing above A1', () => {
  const bankLvl = new Map(grammarBank('pt').map(g => [g.key, g.level]));
  for (const s of days('A1', 'pt')) {
    assert.ok(!s.questions.some(q => q.kind === 'write' || q.kind === 'answer' || q.kind === 'speak'), 'no free production at A1');
    assert.ok(s.questions.filter(q => q.source === 'grammar').every(q => bankLvl.get(q.ref) === 1), 'only A1 grammar');
    assert.ok(s.questions.filter(q => q.source === 'word').length >= 4, 'mostly words at A1');
  }
});
test('A2 gets more grammar and active production (≈40% grammar, corrections, production, ≈15% words)', () => {
  const m = mixFor('A2', 10, {grammar: 100, mistakes: 10, words: 20, produce: 3});
  assert.deepEqual(m, {g: 4, c: 3, p: 2, v: 1});
  assert.deepEqual(mixFor('A1', 10, {grammar: 100, mistakes: 10, words: 20, produce: 3}), {g: 3, c: 2, p: 1, v: 4});
  let grammar = 0, produce = 0, words = 0, total = 0;
  for (const s of days('A2', 'pt')) { total += s.questions.length; grammar += s.questions.filter(q => q.source === 'grammar' && q.kind !== 'answer').length;
    produce += s.questions.filter(q => ['write', 'answer', 'speak'].includes(q.kind)).length; words += s.questions.filter(q => q.source === 'word' && q.kind !== 'write').length; }
  assert.ok(grammar / total >= 0.3, 'grammar share ' + grammar / total);
  assert.ok(produce / total >= 0.1, 'production share ' + produce / total);
  assert.ok(words / total <= 0.25, 'words share ' + words / total);
  // A2 grammar is A2 material (past tenses, ser/estar, contractions …), not only A1 present tense
  const refs = days('A2', 'pt').flatMap(s => s.questions.filter(q => q.source === 'grammar').map(q => q.ref));
  assert.ok(refs.some(r => /:pf:|:imp:|:se:|:pr:/.test(r)), 'A2 topics present');
});
test('Portuguese and Dutch: correct forms, unambiguous (time marker), every choose item has its answer once', () => {
  const pt = grammarBank('pt'), nl = grammarBank('nl');
  assert.ok(pt.length > 300 && nl.length > 300);
  const ir = pt.find(g => g.key === 'gr:pt:ch:ir:pf:0');
  assert.equal(ir.prompt, 'Ontem eu ___ ao supermercado.'); assert.deepEqual(ir.answers, ['fui']); assert.deepEqual([...ir.options].sort(), ['fui', 'ia', 'ir', 'vou']);
  assert.equal(pt.find(g => g.key === 'gr:pt:fi:fazer:imp:2').answers[0], 'fazíamos');
  assert.equal(pt.find(g => g.key === 'gr:pt:cj:ter:pres:3').answers[0], 'têm');
  assert.equal(nl.find(g => g.key === 'gr:nl:ch:gaan:perf:0').prompt, 'Ik ___ gisteren naar de markt gegaan.');
  assert.deepEqual(nl.find(g => g.key === 'gr:nl:ch:gaan:perf:0').answers, ['ben']);
  assert.deepEqual(nl.find(g => g.key === 'gr:nl:ch:werken:perf:2').options, ['heeft', 'is', 'heb', 'ben']); // v67: four options
  assert.equal(nl.find(g => g.key === 'gr:nl:fi:wonen:imp:4').prompt, 'Mijn ouders _____ vroeger in Utrecht.');
  for (const g of [...pt, ...nl]) {
    if (g.options) { assert.equal(new Set(g.options).size, g.options.length, 'no duplicate option ' + g.key); assert.equal(g.options.filter(o => g.answers.includes(o)).length, 1, 'exactly one right option ' + g.key); }
    if (/:(pf|imp|perf):/.test(g.key) && g.kind !== 'conjugate') assert.match(g.prompt, /Ontem|Antigamente|Em 2019|gisteren|vroeger/, 'past needs a marker ' + g.key);
    assert.ok(g.notes.length >= 1, 'explanation ' + g.key);
  }
  for (const s of [...days('A2', 'nl', 5), ...days('B1', 'nl', 5)]) assert.ok(s.questions.some(q => q.source === 'grammar'), 'Dutch grammar used');
});
test('personal mistakes are used, once per unique mistake, with their weight', () => {
  const u = uniqueMistakes(ptMistakes);
  assert.equal(u.length, 2, 'the same mistake from two reports = one'); assert.equal(u.find(m => /mercado/.test(m.original)).repeats, 6);
  for (const s of days('A2', 'pt')) {
    const mq = s.questions.filter(q => q.source === 'mistake');
    assert.ok(mq.length >= 1, 'own mistakes in every set');
    assert.equal(new Set(mq.map(q => q.ref)).size, mq.length, 'never the same mistake twice in a set');
    assert.equal(new Set(s.questions.map(q => q.ref)).size, s.questions.length, 'no duplicates at all');
  }
  // a repeated past-tense mistake makes past-tense grammar more likely than without it
  const past = list => list.flatMap(s => s.questions.filter(q => q.source === 'grammar' && /:(pf|imp):/.test(q.ref))).length;
  assert.ok(past(days('A2', 'pt', 14)) >= past(days('A2', 'pt', 14, {mistakes: [M(3, 'Eu sou cansado', 'Eu estou cansado', 'Ser of estar', 4)]})), 'weak point gets more practice');
});
test('several correct answers are accepted where the context allows', () => {
  const cj = grammarBank('pt').find(g => g.key === 'gr:pt:cj:ir:pf:1');
  const q = {kind: 'fill', answers: cj.answers};
  for (const a of ['foi', 'você foi', 'ele foi']) assert.equal(checkAnswer(q, a), 'correct', a);
  assert.equal(checkAnswer({kind: 'fill', answers: ['fazíamos']}, 'faziamos'), 'accent');
  assert.equal(checkAnswer({kind: 'fill', answers: ['ben', 'ik ben']}, 'Ik ben'), 'correct');
});
test('report: identical errors once (capitals/punctuation ignored), with count and moments; different sentences stay separate', () => {
  const E = (id, o, c, start, extra = {}) => ({id, utterance_id: id, original: o, corrected: c, why: 'Bij gaan gebruik je zijn.', type: 'conjugation', category: 'Hebben versus zijn', category_key: 'auxiliary', topic_id: null, start, certainty: 'certain', kind: 'error', repeats: 1, later: false, word: null, word_en: null, status: 'pending', ...extra});
  const list = [E('u1', 'Ik heb gisteren naar school gegaan', 'Ik ben gisteren naar school gegaan', 10), E('u2', 'ik heb gisteren naar school gegaan.', 'Ik ben gisteren naar school gegaan.', 50),
    E('u3', 'Ik heb gisteren naar school gegaan!', 'Ik ben gisteren naar school gegaan', 90), E('u4', 'Ik heb gisteren naar de school gegaan', 'Ik ben gisteren naar de school gegaan', 120),
    E('u5', 'Ik heb gisteren naar school gegaan', 'Ik ben gisteren naar school gegaan', 200, {status: 'approved'}),
    E('u6', 'Ik heb naar huis gegaan', 'Ik ben naar huis gegaan', 300), E('u7', 'Ik heb naar school gegaan', 'Ik ben naar school gegaan', 400),
    E('u8', 'Ik heb gisteren naar school gegaan', 'Ik ben gisteren naar school gegaan', 500, {category_key: 'word_order', category: 'Woordvolgorde'})];
  const d = dedupeErrors(list);
  const school = d.find(e => e.id === 'u1');
  // u1–u5 identical or nearly (a word more: "de school", "gisteren") → one entry; u7 is the same sentence without "gisteren"
  assert.equal(school.repeats, 6, 'the same error said again and again → one entry with its count'); assert.deepEqual(school.times, [10, 50, 90, 120, 200, 400]); assert.equal(school.status, 'approved');
  assert.ok(d.some(e => e.original === 'Ik heb naar huis gegaan'), 'a different sentence with the same grammar problem is NOT merged');
  assert.ok(!sameError(list[5], list[0]) && !sameError(list[5], list[6]), 'naar huis ≠ naar school');
  assert.equal(d.filter(e => e.category_key === 'word_order').length, 1, 'another category in the same sentence stays its own error');
  assert.deepEqual(dedupeErrors(d).map(e => [e.id, e.repeats]), d.map(e => [e.id, e.repeats]), 'idempotent');
  assert.equal(errorsOf({errors: list}).length, d.length, 'older stored reports are shown deduplicated too');
  assert.equal(groupErrors(d)[0].items[0].id, 'u1', 'most frequent first');
  const doc = read('components/ErrorReview.tsx'); assert.match(doc, /e\.times \|\| \[e\.start\]/); assert.match(doc, /\{0\}× in deze les/);
});
test('daily practice uses deduplicated, approved report errors; one AI call per free answer only', () => {
  const c = read('components/DailyPractice.tsx');
  assert.match(c, /errorsOf\(r\.final as never\)\.filter\(e => e\.status !== 'rejected'/);
  assert.match(c, /p_kind: qq\.source === 'mistake' \? 'error' : qq\.source === 'grammar' \? 'grammar' : 'homework'/, 'grammar items use the existing spaced repetition');
  assert.match(c, /\{!!q\.notes\?\.length && <NoteList className="dp-notes"/, 'feedback explains why (v67: in the explanation language)');
  assert.equal((c.match(/authedPost</g) || []).length, 1, 'still one feedback call');
  const r = read('app/api/practice/check/route.ts'); assert.match(r, /The learner answers this question/); assert.match(r, /await enforceLimit\(db, user\.id, 'exercises'\);/);
  assert.match(read('supabase/v48.sql'), /item_key ~ '\^\(err\|hw\|gr\):/, 'gr: keys already allowed: no migration needed');
});
test('settings menu: three sections, same controls, portal on top of the video, student link popover with copy', () => {
  const html = read('public/legacy/index.html');
  const mod = html.slice(html.indexOf('v51: SETTINGS MENU + STUDENT LINK'), html.indexOf('v47: SCREEN SHARE BUTTON'));
  assert.match(mod, /section\("Lesinstellingen"/); assert.match(mod, /section\("Opname en AI-analyse"/); assert.match(mod, /section\("Overige acties"/);
  assert.match(html, /\.v51-layer\{position:fixed;inset:0;pointer-events:none;z-index:2147483000\}/, 'above everything, also the video');
  assert.match(mod, /document\.body\.appendChild\(layer\)/, 'portal: never cut off by a container');
  assert.match(mod, /if\(h <= below \|\| below >= above\)/, 'flips when there is no room');
  assert.match(mod, /box\.style\.maxHeight = Math\.max\(160, below - 6\) \+ "px"/, 'scrolls on small screens');
  assert.match(mod, /e\.key === "Escape" && openBox/); assert.match(mod, /!openTrig\.contains\(e\.target\)\) close\(\)/);
  assert.match(mod, /label\(true\); clearTimeout\(tm\); tm = setTimeout\(function\(\)\{ label\(false\); \}, 1600\)/, '"Gekopieerd" briefly');
  assert.match(mod, /SB \? \(bridge\(\) && bridge\(\)\.liveUrl\)/, 'the link of THIS lesson');
  assert.ok(!/getUserMedia|new Peer\(|iceServers|peer\.call\(/.test(mod), 'camera, microphone, WebRTC untouched');
});
