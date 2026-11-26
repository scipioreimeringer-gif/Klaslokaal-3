// AI lesson analysis 2.0: deterministic core + the full pipeline with a FAKE model and in-memory store.
// No OpenAI calls, no cost. Transcripts are generated, fictional lessons (no real student data).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseUtterances, chunkUtterances, chunkText, verifyErrors, mergeChunks, categoryKey, relevanceOf, trendFor,
  guardSuggestions, homeworkCategories, wordCount} from '../../lib/analysis/core.ts';
import {runPipeline} from '../../lib/analysis/pipeline.ts';

/* ---------------- fictional lesson generator ---------------- */
const TOPICS = [
  {id: 't-inv', title: 'Inversie na tijdsbepaling', level: 'A2', status: 'in_progress'},
  {id: 't-aux', title: 'Perfectum met zijn', level: 'A2', status: 'not_started'},
  {id: 't-irr', title: 'Irrealis in het verleden', level: 'B2', status: 'not_started'},
  {id: 't-art', title: 'De en het', level: 'A1', status: 'not_started'},
];
const T_LINES = ['Goed zo, vertel eens wat meer over je weekend en wat je allemaal gedaan hebt.', 'Wat heb je gisteren gedaan nadat je klaar was met werken op kantoor?', 'Let op de volgorde van het werkwoord als je de zin met een tijd begint.', 'Heel mooi, en hoe vond je dat eigenlijk zelf, was het leuk of niet?'];
const S_OK = ['Ik vind het leuk om in het weekend te wandelen met mijn hond.', 'Mijn zus woont in Utrecht en zij werkt in een ziekenhuis.', 'Ik drink elke ochtend koffie voordat ik naar mijn werk ga.'];
/** minutes of a lesson; returns the transcript + exactly how many real mistakes were planted per category */
function lesson(minutes, {labels = true} = {}) {
  const lines = []; const planted = {inversion: 0, auxiliary: 0, later: 0, self: 0, slip: 0};
  const targetWords = minutes * 130; let words = 0, n = 0;
  while (words < targetWords) {
    const sec = Math.round(words / 130 * 60); const ts = `[${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}]`;
    const tl = T_LINES[n % T_LINES.length];
    let sl;
    if (n % 9 === 4) { sl = `Gisteren ik ben naar de markt gegaan met ${['mijn moeder', 'een vriend', 'mijn buurman'][n % 3]}.`; planted.inversion++; }
    else if (n % 13 === 6) { sl = `Daarna ik heb naar huis gegaan met de bus nummer ${n}.`; planted.auxiliary++; planted.inversion++; }
    else if (n % 41 === 20) { sl = 'Als ik rijk was geweest, ik had een huis gekocht hebben.'; planted.later++; }
    else if (n % 29 === 11) { sl = 'Ik heb... nee, ik ben naar Amsterdam gegaan.'; planted.self++; }
    else if (n === 17) { sl = 'Ik ga ga morgen naar de dokter.'; planted.slip++; }
    else sl = S_OK[n % S_OK.length];
    lines.push(labels ? `${ts} DOCENT: ${tl}` : tl, labels ? `${ts} LEERLING: ${sl}` : sl);
    words += wordCount(tl) + wordCount(sl); n++;
  }
  // the teacher repeats a wrong phrase while correcting: must NEVER count as a student error
  lines.push(labels ? '[99:00] DOCENT: Niet gisteren ik ben, maar gisteren ben ik.' : 'Niet gisteren ik ben, maar gisteren ben ik.');
  return {text: lines.join('\n'), planted};
}

/* ---------------- fake model: reads the chunk text like a model would ---------------- */
function fakeAsk({failChunks = new Set(), failSynthesis = 0, failHomework = 0, log = []} = {}) {
  const state = {chunkFails: new Map(), synthFails: failSynthesis, hwFails: failHomework};
  const ask = async (step, schema, system, user, maxTokens) => {
    log.push({step, maxTokens, chars: system.length + user.length});
    if (step === 'chunk') {
      const part = +user.match(/^Part (\d+)/)[1] - 1;
      if (failChunks.has(part) && !state.chunkFails.get(part)) { state.chunkFails.set(part, 1); throw new Error('AI-fout: 502'); } // v72: a too-long answer is split and retried (tests/unit/v72); other failures → partial
      const alias = title => (system.match(new RegExp(`(T\\d+) \\[\\w+\\] ${title}`)) || [])[1] || null;
      const errors = [];
      for (const line of user.split('\n')) { // includes the context lines on purpose: the pipeline must ignore those
        const m = line.match(/^(u\d+) (DOCENT|LEERLING|ONBEKEND): (.*)$/); if (!m) continue;
        const [, id, who, text] = m;
        if (/Gisteren ik ben|gisteren ik ben/.test(text)) errors.push({utterance_id: id, original: 'gisteren ik ben', corrected: 'gisteren ben ik', category: id.length % 2 ? 'Inversie' : 'Werkwoord op de tweede plaats', topic: alias('Inversie na tijdsbepaling'), kind: 'error', certainty: 'certain'});
        if (/Daarna ik heb/.test(text)) {
          errors.push({utterance_id: id, original: 'Daarna ik heb', corrected: 'Daarna ben ik', category: 'Woordvolgorde: inversie', topic: alias('Inversie na tijdsbepaling'), kind: 'error', certainty: 'certain'});
          errors.push({utterance_id: id, original: 'heb naar huis gegaan', corrected: 'ben naar huis gegaan', category: 'Hulpwerkwoord hebben/zijn', topic: alias('Perfectum met zijn'), kind: 'error', certainty: 'certain'});
          errors.push({utterance_id: id, original: 'heb naar huis gegaan', corrected: 'ben naar huis gegaan', category: 'hebben of zijn', topic: null, kind: 'error', certainty: 'certain'}); // duplicate
        }
        if (/rijk was geweest/.test(text)) errors.push({utterance_id: id, original: 'ik had een huis gekocht hebben', corrected: 'had ik een huis gekocht', category: 'Irrealis', topic: alias('Irrealis in het verleden'), kind: 'error', certainty: 'uncertain'});
        if (/nee, ik ben/.test(text)) errors.push({utterance_id: id, original: 'Ik heb', corrected: 'Ik ben', category: 'hebben/zijn', topic: alias('Perfectum met zijn'), kind: 'self_correction', certainty: 'certain'});
        if (/ga ga/.test(text)) errors.push({utterance_id: id, original: 'ga ga', corrected: 'ga', category: 'Herhaling', topic: null, kind: 'slip', certainty: 'certain'});
        if (who === 'LEERLING' && /hond/.test(text)) errors.push({utterance_id: id, original: 'ik wil een appel eten', corrected: 'x', category: 'Lidwoorden', topic: alias('De en het'), kind: 'error', certainty: 'certain'}); // invented quote
      }
      return {errors, covered: [{topic: alias('Perfectum met zijn'), label: 'Perfectum met zijn'}], positives: [], new_words: [{term: 'de markt', translation: 'the market'}]};
    }
    if (step === 'synthesis') {
      if (state.synthFails-- > 0) throw new Error('AI-antwoord was te lang en is afgebroken');
      const input = JSON.parse(user);
      return {report: {summary: 'Samenvatting.', covered: ['Perfectum met zijn'], went_well: ['Vloeiend verteld'], focus: input.categories.map(c => c.label).slice(0, 4), next_lesson: 'Inversie herhalen.'},
        explanations: input.categories.map(c => ({key: c.key, label: c.label, explanation: `Regel voor ${c.label}.`})),
        suggestions: [{topic: (system + user).match(/(T\d+) \[A2\] Perfectum met zijn/)?.[1] || 'T2', to: 'covered', reason: 'Uitgelegd', evidence_count: 1},
          {topic: (user.match(/(T\d+) \[A2\] Inversie/) || [])[1] || 'T1', to: 'mastered', reason: 'Eén goede zin', evidence_count: 1}],
        later_note: 'Irrealis komt later.', source_quality: 'good', quality_note: ''};
    }
    if (step === 'homework') {
      if (state.hwFails-- > 0) throw new Error('netwerkfout');
      const input = JSON.parse(user);
      return {title: 'Huiswerk', items: input.categories.flatMap(c => Array.from({length: 4}, (_, i) => ({category_key: c.key, type: 'fill_in', prompt: `${c.label} ${i + 1}`, passage: '', options: ['x'], answer: 'a', accept: [], explanation: ''})))};
    }
    throw new Error('unknown step ' + step);
  };
  return {ask, log, state};
}
function memStore() {
  const s = {parts: new Map(), draft: null, homework: [], finished: null, failed: null, stages: []};
  return {s, store: {
    async parts() { return [...s.parts.values()].map(p => ({...p})); },
    async savePart(index, status, result) { const prev = s.parts.get(index); s.parts.set(index, {index, status, result, attempts: (prev?.attempts || 0) + 1}); },
    async stage(st) { s.stages.push(st); },
    async saveDraft(doc) { s.draft = structuredClone(doc); },
    async loadDraft() { return s.draft ? structuredClone(s.draft) : null; },
    async saveHomework(set) { if (!s.homework.length) s.homework.push(set); return 'hw-1'; }, // unique(analysis_id)
    async finish(doc) { s.finished = structuredClone(doc); s.failed = null; },
    async fail(stage, message, partial) { s.failed = {stage, message, partial}; },
  }};
}
const ctxFor = (text, extra = {}) => ({utterances: parseUtterances(text), lessonDate: '2026-11-20', targetLang: 'nl', targetName: 'Dutch', uiName: 'English', level: 'A2',
  notes: '', board: '', lessonGoals: [{topic_id: 't-aux', title: 'Perfectum met zijn'}], topics: TOPICS, history: [], isTest: false, guide: '', ...extra});
const cat = (doc, key) => doc.categories.find(c => c.key === key);

/* ---------------- core ---------------- */
test('parse: our own format, plain "Speaker:" lines and continuation lines', () => {
  const u = parseUtterances('[01:05] DOCENT: Hallo!\n[01:07] LEERLING: Hoi, ik ben\nmoe vandaag.\nTeacher: How are you?\nzomaar een regel');
  assert.deepEqual(u.map(x => [x.id, x.speaker, x.text, x.start]), [['u1', 'teacher', 'Hallo!', 65], ['u2', 'student', 'Hoi, ik ben moe vandaag.', 67], ['u3', 'teacher', 'How are you? zomaar een regel', null]],
    'unlabelled lines continue the previous speaker');
});
test('chunks: logical boundaries, bounded size, context lines never analysed twice', () => {
  const u = parseUtterances(lesson(60).text);
  const c = chunkUtterances(u, 1400);
  const ids = c.flatMap(x => x.ids);
  assert.equal(ids.length, u.length); assert.equal(new Set(ids).size, u.length, 'every utterance in exactly one chunk');
  assert.ok(c.every(x => x.words <= 1400 + 40), 'chunks stay within the word budget');
  assert.ok(c.slice(1).every((x, i) => x.contextIds.every(id => c[i].ids.includes(id))), 'context = end of the previous chunk');
  assert.match(chunkText(c[1], new Map(u.map(x => [x.id, x]))), /\(context, do not analyse\)/);
});
test('verification: invented quotes, teacher lines and duplicates are dropped', () => {
  const u = parseUtterances('DOCENT: Niet gisteren ik ben, maar gisteren ben ik.\nLEERLING: Gisteren ik ben gegaan.');
  const byId = new Map(u.map(x => [x.id, x]));
  const e = (id, original, category = 'Inversie') => ({utterance_id: id, original, corrected: 'x', category, topic_id: null, kind: 'error', certainty: 'certain'});
  const {kept, dropped} = verifyErrors([e('u1', 'gisteren ik ben'), e('u2', 'Gisteren ik ben'), e('u2', 'gisteren  ik ben', 'Werkwoord op de tweede plaats'), e('u2', 'ik wil een appel'), e('u9', 'x')], byId, true);
  assert.equal(kept.length, 1); assert.equal(kept[0].utterance_id, 'u2'); assert.equal(dropped, 3);
});
test('categories: synonyms map to one key; other categories stay possible', () => {
  assert.equal(categoryKey('Inversie').key, categoryKey('Werkwoord op de tweede plaats').key);
  assert.equal(categoryKey('Voltooid tegenwoordige tijd').key, 'past_tense');
  assert.equal(categoryKey('present perfect').key, 'past_tense');
  assert.equal(categoryKey('Tegenwoordige tijd').key, 'present_tense');
  assert.equal(categoryKey('Hulpwerkwoord hebben/zijn').key, 'auxiliary');
  assert.match(categoryKey('Beleefdheidsvormen').key, /^x_/);
});
test('relevance: today\'s goal, known, explained today, later (clearly above level)', () => {
  const m = new Map(TOPICS.map(t => [t.id, t]));
  assert.equal(relevanceOf(['t-aux'], m, 'A2', new Set(['t-aux'])), 'current');
  assert.equal(relevanceOf(['t-inv'], m, 'A2', new Set()), 'known');
  assert.equal(relevanceOf(['t-aux'], m, 'A2', new Set(), new Set(['t-aux'])), 'new_today');
  assert.equal(relevanceOf(['t-irr'], m, 'A2', new Set()), 'later');
  assert.equal(relevanceOf(['t-irr'], m, 'B1', new Set()), 'relevant', 'B2 for a B1 student is not "later"');
  assert.equal(relevanceOf([], m, 'A2', new Set()), 'relevant');
});
test('trend: per 100 student lines, only with enough speech; recurring over lessons', () => {
  const h = n => ({lesson_date: 'x', student_utterances: n, categories: [{key: 'inversion', count: 10}]});
  assert.equal(trendFor('inversion', 2, 100, [h(100), h(100)]).trend.direction, 'down');
  assert.equal(trendFor('inversion', 2, 100, [h(100), h(100)]).recurring, true);
  assert.equal(trendFor('inversion', 2, 100, [h(8)]).trend.direction, 'insufficient', 'no percentage for very short lessons');
  assert.equal(trendFor('inversion', 2, 100, []).trend, null);
});
test('checklist suggestions: never "mastered" on one sentence or with mistakes this lesson', () => {
  const m = new Map(TOPICS.map(t => [t.id, t]));
  const cats = [{key: 'inversion', count: 2, topic_ids: ['t-inv']}];
  const out = guardSuggestions([
    {topic_id: 't-inv', to: 'mastered', reason: '', evidence_count: 5}, // errors this lesson
    {topic_id: 't-art', to: 'mastered', reason: '', evidence_count: 1}, // one sentence
    {topic_id: 't-aux', to: 'covered', reason: 'uitgelegd', evidence_count: 1},
    {topic_id: 'nope', to: 'covered', reason: '', evidence_count: 1},
    {topic_id: 't-inv', to: 'in_progress', reason: '', evidence_count: 1}, // no change
  ], m, cats);
  assert.deepEqual(out.map(s => [s.topic_id, s.from, s.to]), [['t-aux', 'not_started', 'covered']]);
});
test('homework categories: only taught material, never "later" or untaught grammar', () => {
  const c = (key, relevance, topic_ids = ['x']) => ({key, relevance, count: 2, topic_ids});
  assert.deepEqual(homeworkCategories([c('a', 'later'), c('b', 'relevant'), c('word_choice', 'relevant', []), c('d', 'known'), c('e', 'current'), c('f', 'new_today')]).map(x => x.key), ['word_choice', 'd', 'e', 'f']);
});

/* ---------------- pipeline ---------------- */
for (const minutes of [5, 15, 30, 50, 60]) {
  test(`pipeline: ${minutes}-minute lesson — complete, bounded calls, honest counts`, async () => {
    const {text, planted} = lesson(minutes); const {ask, log} = fakeAsk(); const {s, store} = memStore();
    const res = await runPipeline(ctxFor(text), ask, store);
    assert.equal(res.state, 'done'); const doc = s.finished;
    assert.equal(cat(doc, 'inversion').count, planted.inversion, 'inversion counted once per student line (no double counting across chunks)');
    if (planted.auxiliary) assert.equal(cat(doc, 'auxiliary').count, planted.auxiliary, 'duplicate auxiliary report merged');
    assert.ok(doc.categories.every(c => c.examples.length <= 2), 'max 2 examples per category');
    assert.ok(doc.categories.every(c => c.explanation), 'one explanation per category');
    assert.ok(!doc.categories.some(c => c.key === 'articles'), 'invented quote never becomes a mistake');
    assert.ok(!doc.categories.some(c => /herhaling/.test(c.key) && c.count > 0), 'a single slip is not counted');
    if (planted.later) { assert.equal(cat(doc, 'x_irrealis').relevance, 'later'); }
    if (planted.self) assert.equal(cat(doc, 'auxiliary').self_corrections, planted.self);
    assert.ok(doc.dropped_unverified >= 1, 'teacher line / invented quotes dropped');
    const chunks = log.filter(l => l.step === 'chunk');
    assert.equal(chunks.length, doc.chunks); assert.ok(chunks.length >= Math.ceil(minutes * 130 / 1500), 'long lesson is split');
    assert.ok(log.every(l => l.maxTokens <= 10000), 'every model answer is bounded (v72: room for complete error lists, never cut off)');
    assert.ok(chunks.every(l => l.chars < 14000), 'each chunk prompt is bounded, regardless of lesson length');
    assert.equal(log.filter(l => l.step === 'synthesis').length, 1); assert.equal(log.filter(l => l.step === 'homework').length, 1);
    const hw = s.homework[0];
    assert.ok(hw.items.length <= homeworkCategories(doc.categories).length * 3, '≤3 exercises per category');
    assert.ok(!hw.items.some(i => /Irrealis/.test(i.prompt)), 'no homework on "later" material');
    assert.ok(hw.items.every(i => i.type !== 'multiple_choice' ? i.options.length === 0 : true));
    assert.deepEqual(doc.checklist_suggestions.map(x => [x.topic_id, x.to]), [['t-aux', 'covered']], '"mastered" on one sentence refused');
    assert.equal(doc.homework.assignment_id, 'hw-1');
    // v46 phase 2: EVERY verified error is registered (examples stay limited to 2 for the summary)
    const errs = doc.errors;
    // v51: identical errors are listed ONCE with how often they were made — the total still counts every student line
    const inv = errs.filter(e => e.category_key === 'inversion');
    assert.equal(inv.reduce((n, e) => n + e.repeats, 0), planted.inversion, 'every inversion error counted once per student line');
    assert.ok(inv.length < planted.inversion || planted.inversion <= 2, 'repeated identical sentences are not listed again and again');
    assert.ok(inv.every(e => e.times.length === e.repeats), 'the moments are kept');
    if (planted.auxiliary) assert.equal(errs.filter(e => e.category_key === 'auxiliary').reduce((n, e) => n + e.repeats, 0), planted.auxiliary, 'duplicate report in the same line merged');
    assert.ok(errs.every(e => e.status === 'pending'), 'waits for the teacher');
    assert.ok(!errs.some(e => /Niet gisteren/.test(e.original)) && errs.every(e => e.utterance_id), 'never a teacher line');
    assert.ok(!errs.some(e => e.category_key === 'articles'), 'invented quotes never become errors');
    assert.ok(errs.every(e => ['grammar', 'conjugation', 'word_order', 'word_choice', 'missing_word', 'article', 'preposition', 'pronunciation', 'other'].includes(e.type)));
    const gis = errs.filter(e => e.corrected === 'gisteren ben ik');
    assert.ok(gis.length === 1 && gis[0].type === 'word_order' && gis[0].repeats >= 1 && gis[0].repeats === gis[0].times.length, 'the same mistake in several lines = ONE entry with its count (v51)');
    assert.equal(new Set(errs.map(e => e.id)).size, errs.length, 'stable unique ids');
    assert.equal(doc.corrections.length, errs.filter(e => !e.later).length, 'legacy list = all non-"later" errors');
  });
}
test('pipeline: a failed chunk → partial; retry analyses ONLY that chunk, same totals (no duplicates)', async () => {
  const {text} = lesson(50); const clean = memStore(); await runPipeline(ctxFor(text), fakeAsk().ask, clean.store);
  const log = []; const {ask} = fakeAsk({failChunks: new Set([2]), log}); const {s, store} = memStore();
  assert.equal((await runPipeline(ctxFor(text), ask, store)).state, 'partial_failed');
  assert.equal(s.failed.stage, 'chunks'); assert.equal(s.failed.partial, true); assert.equal(s.homework.length, 0);
  const before = log.length;
  assert.equal((await runPipeline(ctxFor(text), ask, store)).state, 'done');
  assert.equal(log.slice(before).filter(l => l.step === 'chunk').length, 1, 'only the failed part is redone');
  assert.deepEqual(s.finished.categories.map(c => [c.key, c.count]), clean.s.finished.categories.map(c => [c.key, c.count]));
});
test('pipeline: synthesis cut off → stored chunks kept, retry continues', async () => {
  const log = []; const {ask} = fakeAsk({failSynthesis: 1, log}); const {s, store} = memStore();
  assert.equal((await runPipeline(ctxFor(lesson(30).text), ask, store)).state, 'partial_failed');
  assert.equal(s.failed.stage, 'synthesis'); assert.equal(s.draft.steps.merged, true);
  const n = log.filter(l => l.step === 'chunk').length;
  assert.equal((await runPipeline(ctxFor(lesson(30).text), ask, store)).state, 'done');
  assert.equal(log.filter(l => l.step === 'chunk').length, n, 'no chunk analysed again');
});
test('pipeline: homework failure + retry → exactly one homework draft', async () => {
  const {ask} = fakeAsk({failHomework: 1}); const {s, store} = memStore();
  assert.equal((await runPipeline(ctxFor(lesson(15).text), ask, store)).state, 'partial_failed');
  assert.equal((await runPipeline(ctxFor(lesson(15).text), ask, store)).state, 'done');
  assert.equal(s.homework.length, 1);
});
test('pipeline: deadline → paused, resumed later from the stored state', async () => {
  const {ask, log} = fakeAsk(); const {s, store} = memStore(); const text = lesson(60).text;
  assert.equal((await runPipeline(ctxFor(text, {deadline: Date.now() - 1}), ask, store)).state, 'paused');
  assert.equal(s.finished, null); assert.equal(s.failed, null, 'a pause is not a failure');
  assert.equal((await runPipeline(ctxFor(text), ask, store)).state, 'done');
  assert.equal(log.filter(l => l.step === 'synthesis').length, 1);
});
test('pipeline: TEST analysis → no homework, no checklist suggestions', async () => {
  const {ask, log} = fakeAsk(); const {s, store} = memStore();
  await runPipeline(ctxFor(lesson(15).text, {isTest: true}), ask, store);
  assert.equal(s.homework.length, 0); assert.equal(log.filter(l => l.step === 'homework').length, 0);
  assert.deepEqual(s.finished.checklist_suggestions, []); assert.equal(s.finished.homework.skipped_reason, 'test');
});
test('pipeline: too little content → honest quality note, no homework', async () => {
  const {ask} = fakeAsk(); const {s, store} = memStore();
  await runPipeline(ctxFor('DOCENT: Hallo, hoe gaat het?\nLEERLING: Gisteren ik ben moe.', {thinNote: 'Te weinig lesinhoud.'}), ask, store);
  assert.equal(s.finished.source_quality, 'poor'); assert.equal(s.homework.length, 0); assert.equal(s.finished.homework.skipped_reason, 'too_little_content');
});
test('pipeline: speakers not separated → counts marked unreliable, examples uncertain', async () => {
  const {ask} = fakeAsk(); const {s, store} = memStore();
  await runPipeline(ctxFor(lesson(15, {labels: false}).text), ask, store);
  assert.equal(s.finished.speakers_separated, false);
  assert.ok(s.finished.categories.every(c => !c.count_reliable && c.examples.every(e => e.certainty === 'uncertain')));
});
test('pipeline: A0 explanations in the interface language, otherwise in the target language', async () => {
  const a = memStore(); await runPipeline(ctxFor(lesson(5).text, {level: 'A0'}), fakeAsk().ask, a.store);
  const b = memStore(); await runPipeline(ctxFor(lesson(5).text), fakeAsk().ask, b.store);
  assert.equal(a.s.finished.explanation_language, 'English'); assert.equal(b.s.finished.explanation_language, 'Dutch');
});
