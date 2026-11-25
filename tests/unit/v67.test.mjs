// v67: practice quality — four plausible options of one word class and one language, grammar multiple choice per
// level, clean word bank records in games, unambiguous match pairs, flashcard grammar variants, explanation language.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {singleConcept, pickDistractors, validMc, wordClass, answerVariants, defaultExplainLang, noteText, firstMeaning} from '../../lib/quiz.ts';
import {quizOptions, grammarQuiz, matchDeck, flashFace, wordDeck} from '../../lib/practice.ts';
import {grammarBank} from '../../lib/grammar.ts';
import {buildDaily} from '../../lib/daily.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');

const C = (term, meaning, pos) => ({key: 'v:' + term, term, meaning, pos, source: 'own'});
const pool = [C('vergeten', 'to forget', 'verb'), C('onthouden', 'to remember', 'verb'), C('kiezen', 'to choose', 'verb'), C('herkennen', 'to recognize', 'verb'),
  C('de fiets', 'bike', 'noun'), C('de taart', 'cake', 'noun'), C('slapen', 'to sleep', 'verb'), C('mooi', 'beautiful', 'adjective'), C('de keuken', 'kitchen', 'noun'),
  C('Receita Federal / está aberta / Dia da Consciência Negra', 'tax office / is open / Black Awareness Day', ''), C('vertrekken', 'to leave', 'verb')];

test('vocabulary multiple choice: four options, one correct, same word class, never random nouns for a verb', () => {
  for (let s = 1; s < 30; s++) {
    const o = quizOptions(pool[0], pool, 'A2', s);
    assert.equal(o.length, 4); assert.ok(validMc({options: o, answer: 'to forget'}));
    assert.ok(o.every(x => /^to /.test(x)), 'only verbs: ' + o.join(', '));
    assert.ok(!o.some(x => /tax office|bike|cake/.test(x)));
  }
  const pos = new Set(Array.from({length: 40}, (_, s) => quizOptions(pool[0], pool, 'B1', s).indexOf('to forget')));
  assert.ok(pos.size >= 3, 'answer position is random');
  // too few words of the same class → no question (replaced), never a mixed set
  assert.deepEqual(quizOptions(pool[7], pool, 'A2', 1), []);
});

test('word bank records with several concepts stay out of games; real expressions stay whole', () => {
  assert.equal(singleConcept('Receita Federal / está aberta / Dia da Consciência Negra'), false);
  assert.equal(singleConcept('appel, peer, banaan'), false);
  assert.equal(singleConcept('de kat uit de boom kijken', 'expression'), true);
  assert.equal(singleConcept('vergeten'), true);
  const d = wordDeck(pool.map(c => ({id: c.term, term: c.term, translation: c.meaning, pos: c.pos})), [], 'B1', 20, 1);
  assert.ok(!d.cards.some(c => /Receita/.test(c.term)));
  assert.equal(firstMeaning('to remember / to recall'), 'to remember');
  assert.deepEqual(answerVariants('de fiets / het rijwiel').sort(), ['de fiets', 'fiets', 'het rijwiel', 'rijwiel']);
  assert.equal(wordClass({term: 'lopen', meaning: 'to walk'}), 'verb'); assert.equal(wordClass({term: 'het huis', meaning: 'house'}), 'noun');
});

test('distractors: same class, similar form, never the answer itself or a word containing it', () => {
  const d = pickDistractors({text: 'to forget', cls: 'verb'}, [{text: 'to forget', cls: 'verb'}, {text: 'to forget it', cls: 'verb'}, {text: 'to choose', cls: 'verb'}, {text: 'cake', cls: 'noun'}, {text: 'to recognize', cls: 'verb'}, {text: 'to remember', cls: 'verb'}], 3);
  assert.deepEqual(d.sort(), ['to choose', 'to recognize', 'to remember']);
});

test('grammar multiple choice per level: four options, one answer, Dutch and Portuguese, no topic dominates', () => {
  for (const lang of ['nl', 'pt']) for (const lv of ['A1', 'A2', 'B1', 'B2', 'C1']) {
    const g = grammarQuiz(lang, lv, 6, 7);
    assert.ok(g.length >= (lv === 'A1' && lang === 'pt' ? 1 : 3), `${lang} ${lv}: ${g.length}`);
    for (const x of g) { assert.ok(validMc({options: x.options, answer: x.answers[0]}), x.key); assert.ok(x.level <= ['A1', 'A2', 'B1', 'B2', 'C1'].indexOf(lv) + 1 || lv === 'A1'); }
  }
  // A1 stays A1; B1 includes the B1 examples of the learning line
  assert.ok(grammarQuiz('nl', 'A1', 8, 3).every(x => x.level <= 1));
  const nl = grammarBank('nl');
  const rel = nl.find(g => g.prompt === 'De vrouw ___ naast mij woont, is huisarts.'); assert.deepEqual([...rel.options].sort(), ['dat', 'die', 'waar', 'wie']);
  const past = nl.find(g => g.key === 'gr:nl:ch:beginnen:imp:0'); assert.equal(past.options.length, 4);
  for (const g of [...nl, ...grammarBank('pt')].filter(g => g.kind === 'choose')) assert.equal(g.options.length, 4, 'four options: ' + g.key);
});

test('match: no duplicate words or meanings, single concepts, one coherent group when possible', () => {
  const cards = [...pool, C('verlaten', 'to leave', 'verb'), C('kiezen', 'to pick', 'verb')];
  const m = matchDeck(cards, 5, 2);
  assert.equal(new Set(m.map(c => c.term)).size, m.length); assert.equal(new Set(m.map(c => c.meaning)).size, m.length);
  assert.ok(m.every(c => wordClass(c) === 'verb'), 'one group: ' + m.map(c => c.term));
  assert.ok(!m.some(c => /Receita/.test(c.term)));
});

test('flashcards: grammar variants from the stored word data (past, participle + hebben/zijn, article, plural)', () => {
  const v = {...C('lopen', 'to walk', 'verb'), gram: {pos: 'verb', past_sg: 'liep', past_pl: 'liepen', participle: 'gelopen', aux: 'Z'}};
  const faces = Array.from({length: 12}, (_, s) => flashFace(v, 'A2', s, false));
  assert.ok(faces.some(f => f.back === 'liep / liepen')); assert.ok(faces.some(f => f.back === 'is gelopen')); assert.ok(faces.some(f => f.back === 'to walk'));
  assert.ok(Array.from({length: 12}, (_, s) => flashFace(v, 'A1', s, false)).every(f => f.back === 'to walk'), 'A1: no past forms');
  const n = {...C('het huis', 'house', 'noun'), gram: {pos: 'noun', article: 'het', plural: 'huizen'}};
  assert.ok(Array.from({length: 12}, (_, s) => flashFace(n, 'A1', s, false)).some(f => f.back === 'het huis' && f.front === 'huis'));
});

test('explanation language: English for learners of Dutch, never Portuguese grammar text for a Dutch/English setting', () => {
  assert.equal(defaultExplainLang('nl', 'nl'), 'en'); assert.equal(defaultExplainLang('pt', 'nl'), 'nl');
  const tr = (l, k, a) => l === 'en' && k === '{0} is mannelijk.' ? `${a[0]} is masculine.` : k;
  assert.equal(noteText({k: '{0} is mannelijk.', a: ['problema']}, 'en', tr), 'problema is masculine.');
  const pt = grammarBank('pt').find(g => g.key.startsWith('gr:pt:ad:') && g.kind === 'fill');
  assert.equal(pt.notes[0].raw, 'pt');
  assert.ok(!/subjuntivo:|Ação/.test(noteText(pt.notes[0], 'nl', tr).slice(0, 4)) && noteText(pt.notes[0], 'nl', tr).length > 10, 'Dutch explanation');
  assert.ok(noteText(pt.notes[0], 'en', tr).length > 10);
  assert.equal(noteText({k: 'Alleen Portugees', raw: 'pt'}, 'en', tr), '', 'hidden rather than in the wrong language');
  for (const g of grammarBank('nl').filter(g => g.notes.some(n => n.raw))) assert.ok(g.notes.every(n => !n.raw || n.alt?.en), 'English for ' + g.key);
  for (const g of grammarBank('pt').filter(g => g.notes.some(n => n.raw))) assert.ok(g.notes.every(n => !n.raw || (n.raw === 'nl' && n.alt?.en) || (n.alt?.en && n.alt?.nl)), 'nl + en for ' + g.key);
  const l = read('components/Learning.tsx');
  assert.match(l, /<NoteList className="pr-notes"/); assert.match(l, /<ExplainLangSelect value=\{ex\}/);
});

test('daily practice: multiple choice only with four valid options; multi-concept records never as an option', () => {
  const words = pool.map((c, i) => ({id: 'w' + i, term: c.term, translation: c.meaning, pos: c.pos, status: 'new', due_at: '2026-01-01', wrong_count: 0, streak: 0}));
  for (let d = 1; d <= 20; d++) {
    const s = buildDaily({studentId: 's', day: '2026-11-' + String(d).padStart(2, '0'), level: 'A2', lang: 'nl', words, mistakes: [], homework: [], state: []});
    for (const q of s.questions.filter(q => q.kind === 'mc' && q.source === 'word')) {
      assert.ok(validMc({options: q.options, answer: q.answers[0]}), q.prompt + ': ' + q.options);
      assert.ok(!q.options.some(o => /Receita|tax office/.test(o)));
    }
  }
});
