// v35: canvas word recognition, word selection, taboo cards and the synchronised classroom game.
// Fake AI and a simulated two-player data channel: no OpenAI calls, no real student data.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canvasBlocks, candidatesFrom, mergeCandidates, newOnly, pageHash, selectWords, pickRound, cleanTaboo, isSentence} from '../../lib/vocab/core.ts';
import {detectPages} from '../../lib/vocab/detect.ts';
import {newGame, reduce, remaining, wire, fromWire, flashSummary} from '../../lib/games/state.ts';

const page = (title, blocks) => ({title, html: blocks.map(([t, x]) => `<div data-t="${t}">${x}</div>`).join('')});
/** fake model: keeps every candidate except obvious non-vocabulary; gives a meaning when none is written */
function fakeAsk(log = []) {
  return async (schema, system, user) => {
    const {candidates} = JSON.parse(user); log.push(candidates.length);
    return {items: candidates.map(c => ({index: c.index, keep: !/^(huiswerk|oefening|les \d+|maandag|pagina \d+|sofia)/i.test(c.text), translation: c.meaning_on_canvas || (c.text === 'de bank' ? 'bank; bench' : 'meaning of ' + c.text), pos: 'noun', kind: /\s/.test(c.text) && !/^(de|het|een)\s/.test(c.text) ? 'expression' : 'word'}))};
  };
}
const detect = (pages, extra = {}) => { const log = []; return detectPages(pages, {existing: [], scanned: new Set(), targetName: 'Dutch', explainName: 'English', level: 'A2', ask: fakeAsk(log), ...extra}).then(r => ({...r, log})); };

/* ---------- 1–5, 20: recognition ---------- */
test('1. five single words on the canvas → five suggestions, original spelling kept', async () => {
  const r = await detect([page('Woorden', [['h', 'Nieuwe woorden'], ['li', 'de afspraak'], ['li', 'het Ziekenhuis'], ['li', 'verhuizen'], ['li', 'de huisarts'], ['li', 'gezellig']])]);
  assert.deepEqual(r.suggestions.map(s => s.term), ['de afspraak', 'het Ziekenhuis', 'verhuizen', 'de huisarts', 'gezellig']);
  assert.ok(r.suggestions.every(s => s.page === 'Woorden'), 'origin page stored');
});
test('2. a word that occurs several times → one suggestion; already in the list → none', async () => {
  const r = await detect([page('Les', [['li', 'de afspraak'], ['p', 'De afspraak'], ['li', 'de afspraak = appointment']])]);
  assert.equal(r.suggestions.length, 1); assert.equal(r.suggestions[0].translation, 'appointment');
  assert.equal(newOnly(r.suggestions, ['De Afspraak']).length, 0);
});
test('3. a full grammatical sentence never becomes a word card (kept as example instead)', async () => {
  const blocks = canvasBlocks(page('Grammatica', [['li', 'de afspraak'], ['p', 'Ik heb morgen een afspraak bij de tandarts.'], ['p', 'Na een tijdsbepaling komt eerst het werkwoord en dan het onderwerp.']]).html);
  const c = candidatesFrom(blocks, 'Grammatica');
  assert.deepEqual(c.map(x => x.term), ['de afspraak']);
  assert.equal(c[0].example, 'Ik heb morgen een afspraak bij de tandarts.');
  assert.ok(isSentence('Ik heb morgen een afspraak bij de tandarts.'));
});
test('4. a word with several meanings → one card with both meanings', async () => {
  assert.equal(mergeCandidates(candidatesFrom(canvasBlocks(page('p', [['li', 'de bank = bank (money)'], ['li', 'de bank = bench']]).html), 'p'))[0].translation, 'bank (money); bench');
  const r = await detect([page('p', [['li', 'de bank'], ['li', 'het fietspad']])]);
  assert.equal(r.suggestions.find(s => s.term === 'de bank').translation, 'bank; bench');
});
test('5. a multi-word expression is kept whole as an expression', async () => {
  const c = candidatesFrom(canvasBlocks(page('p', [['li', 'een afspraak maken = to make an appointment'], ['li', 'op tijd'], ['li', 'het huis']]).html), 'p');
  assert.deepEqual(c.map(x => [x.term, x.kind]), [['een afspraak maken', 'expression'], ['op tijd', 'expression'], ['het huis', 'word']]);
});
test('20. a canvas full of other text: headings, instructions, dates, sentences and links are left out', async () => {
  const r = await detect([page('Les 12 – maandag', [['h', 'Les 12'], ['p', 'Huiswerk: oefening 3 en 4 maken voor maandag.'], ['p', 'Lees de tekst op pagina 12 en beantwoord de vragen in hele zinnen.'], ['p', 'https://example.org/tekst'], ['li', '12'], ['li', 'Sofia'],
    ['li', 'de vergadering'], ['p', 'We hebben om tien uur een vergadering met het hele team.'], ['li', 'Oefening 5'], ['li', 'uitstellen = to postpone']])]);
  assert.deepEqual(r.suggestions.map(s => s.term).sort(), ['de vergadering', 'uitstellen']);
});
test('19. other target languages (pt-BR, es, de, fr) work the same, accents kept', async () => {
  const c = candidatesFrom(canvasBlocks(page('p', [['li', 'a saudade = longing'], ['li', 'el ordenador'], ['li', 'die Verabredung'], ['li', 'l’été']]).html), 'p');
  assert.deepEqual(c.map(x => x.term), ['a saudade', 'el ordenador', 'die Verabredung', 'l’été']);
});
test('cost control: unchanged page → no new AI request; explicit pairs need no AI at all', async () => {
  const p = page('Woorden', [['li', 'de afspraak'], ['li', 'gezellig']]);
  const first = await detect([p]); assert.equal(first.aiCalls, 1);
  const again = await detect([p], {scanned: new Set([first.hashes[0].hash])}); assert.equal(again.aiCalls, 0); assert.equal(again.suggestions.length, 0);
  const pairs = await detect([page('p', [['li', 'de afspraak = appointment'], ['li', 'het huis = house']])]); assert.equal(pairs.aiCalls, 0); assert.equal(pairs.suggestions.length, 2);
  assert.notEqual(pageHash('a'), pageHash('b'));
});

/* ---------- selection, 6–7, 15 ---------- */
const W = (id, term, date, extra = {}) => ({id, term, translation: 't-' + term, example: '', status: 'new', lesson_date: date, created_at: date + 'T10:00:00Z', correct_count: 0, wrong_count: 0, ...extra});
const LIST = [W('a', 'de afspraak', '2026-11-03'), W('b', 'de huisarts', '2026-11-03', {wrong_count: 3}), W('c', 'gezellig', '2026-11-10'), W('d', 'verhuizen', '2026-11-10', {status: 'mastered', correct_count: 6}),
  W('e', 'het fietspad', '2026-11-12'), W('f', 'op tijd', '2026-11-12', {difficult: true}), W('g', 'de bank', '2026-10-01'), W('h', 'de buurman', '2026-10-08'), W('i', 'de vergadering', '2026-10-15'), W('j', 'uitstellen', '2026-10-20')];
test('6. words from earlier lessons stay available: last lesson / last five lessons / all / difficult / manual', () => {
  assert.deepEqual(selectWords(LIST, {mode: 'last_lesson'}).map(w => w.id), ['e', 'f']);
  assert.equal(selectWords(LIST, {mode: 'last5'}).length, 8);
  assert.equal(selectWords(LIST, {mode: 'all'}).length, 10);
  assert.deepEqual(selectWords(LIST, {mode: 'difficult'}).map(w => w.id), ['b', 'f']);
  assert.deepEqual(selectWords(LIST, {mode: 'manual', ids: ['g', 'c']}).map(w => w.id), ['c', 'g']);
});
test('rounds prefer difficult / not mastered words and avoid repeats within a session', () => {
  const used = new Set();
  const r1 = pickRound(LIST, 5, used, 1); r1.forEach(w => used.add(w.id));
  const r2 = pickRound(LIST, 5, used, 2);
  assert.equal(r1.length, 5); assert.equal(r2.length, 5);
  assert.equal(r1.filter(w => r2.some(x => x.id === w.id)).length, 0, 'no word twice while unused words remain');
  assert.ok(!r1.some(w => w.id === 'd'), 'a mastered word comes last');
  assert.ok(r1.some(w => w.id === 'b') && r1.some(w => w.id === 'f'), 'difficult words first');
});
test('15. fewer than five suitable words: the selection says so (the app offers a smaller round)', () => {
  const pool = selectWords(LIST, {mode: 'last_lesson'});
  assert.ok(pool.length < 5); assert.equal(pickRound(pool, 5, new Set(), 3).length, pool.length);
});

/* ---------- 9: taboo ---------- */
test('9. taboo: forbidden words never equal or contain the target word; 1, 2 or 3 per card', () => {
  const clean = cleanTaboo('de afspraak', ['agenda', 'afspraak', 'Tijd', 'afspraken', 'ontmoeten', 'agenda', 'een hele lange omschrijving hier']);
  assert.deepEqual(clean, ['agenda', 'Tijd', 'ontmoeten']);
  for (const n of [1, 2, 3]) assert.equal(clean.slice(0, n).length, n);
  assert.deepEqual(cleanTaboo('het ziekenhuis', ['ziek', 'dokter', 'het ziekenhuis', 'patiënt']), ['dokter', 'patiënt']);
});

/* ---------- game: 7, 8, 10–14, 16 ---------- */
test('7. flashcards with existing words: flip, mark good/bad, both players see the same card', () => {
  let s = newGame('g1', 'flash', {cards: LIST.slice(0, 3).map(w => ({id: w.id, term: w.term, back: w.translation, example: ''}))});
  s = reduce(s, {a: 'flip'}, 'student', 0); assert.equal(s.flash.flipped, true, 'the student can flip');
  s = reduce(s, {a: 'mark', result: 'good'}, 'teacher', 0); assert.equal(s.flash.index, 1); assert.equal(s.flash.flipped, false);
  s = reduce(s, {a: 'mark', result: 'bad'}, 'student', 0); s = reduce(s, {a: 'mark', result: 'good'}, 'teacher', 0);
  assert.equal(s.phase, 'ended'); assert.deepEqual(flashSummary(s), {good: 2, bad: 1, total: 3});
});
const round = (s, n = 5, id = 'r1') => reduce(s, {a: 'round', roundId: id, cardCount: n}, 'teacher', 0);
test('8. a 30 Seconds round with five words: timer runs out, score counts guessed words', () => {
  let s = round(newGame('g', 'thirty'));
  s = reduce(s, {a: 'begin'}, 'student', 1000); assert.equal(s.phase, 'running');
  for (const i of [0, 2, 2, 4]) s = reduce(s, {a: 'guessed', index: i}, 'teacher', 5000);
  assert.equal(s.guessed.length, 3, 'a word counts once');
  assert.equal(remaining(s, 21000), 10000);
  s = reduce(s, {a: 'tick'}, 'teacher', 31001); assert.equal(s.phase, 'between'); assert.equal(s.score.teacher, 3); assert.deepEqual(s.rounds[0], {explainer: 'teacher', guessed: 3, of: 5});
  let t = reduce(round(newGame('g', 'thirty')), {a: 'begin'}, 'teacher', 0); for (let i = 0; i < 5; i++) t = reduce(t, {a: 'guessed', index: i}, 'teacher', 1000);
  assert.equal(t.phase, 'between', 'all five guessed → round ends early');
  assert.equal(reduce(newGame('g', 'thirty', {duration: 90}), {a: 'duration', seconds: 60}, 'teacher', 0).remainingMs, 60000, '30/60/90 seconds');
});
test('10–11. only the explainer (student or teacher) can mark words as guessed', () => {
  let s = reduce(round(newGame('g', 'taboo', {explainer: 'student', taboo: 2})), {a: 'begin'}, 'teacher', 0);
  assert.equal(reduce(s, {a: 'guessed', index: 0}, 'teacher', 1).guessed.length, 0, 'teacher guesses: cannot mark');
  assert.equal(reduce(s, {a: 'guessed', index: 0}, 'student', 1).guessed.length, 1, 'student explains: can mark');
  assert.equal(s.taboo, 2);
  let t = reduce(round(newGame('g', 'thirty', {explainer: 'teacher'})), {a: 'begin'}, 'teacher', 0);
  assert.equal(reduce(t, {a: 'guessed', index: 1}, 'student', 1).guessed.length, 0);
  assert.equal(reduce(t, {a: 'round', roundId: 'x', cardCount: 5}, 'student', 1), t, 'the student cannot create rounds');
});
test('12. hidden cards: what is sent to the other player contains no card content', () => {
  const s = reduce(round(newGame('g', 'taboo')), {a: 'begin'}, 'teacher', 0);
  const json = JSON.stringify(wire(s, 2000));
  for (const w of ['afspraak', 'huisarts', 'agenda', 'term', 'forbidden', 'hint']) assert.ok(!json.includes(w), w + ' not on the wire');
  assert.ok(json.includes('"cardCount":5'));
});
test('13. shared timer: the other player continues from the remaining time on receipt (no clock sync needed)', () => {
  const s = reduce(round(newGame('g', 'thirty')), {a: 'begin'}, 'teacher', 100000);
  const w = JSON.parse(JSON.stringify(wire(s, 112000))); // 12 s later
  const g = fromWire(w, 5000); // the student's clock is completely different
  assert.equal(remaining(g, 5000), 18000); assert.equal(remaining(g, 9000), 14000);
  const p = reduce(s, {a: 'pause'}, 'student', 120000); assert.equal(remaining(fromWire(wire(p, 130000), 0), 999999), 10000, 'paused: time stands still');
});
test('14. switching roles between rounds', () => {
  let s = reduce(round(newGame('g', 'thirty')), {a: 'begin'}, 'teacher', 0);
  assert.equal(reduce(s, {a: 'switch'}, 'student', 1).explainer, 'teacher', 'not during a round');
  s = reduce(s, {a: 'tick'}, 'teacher', 40000);
  s = reduce(s, {a: 'switch'}, 'student', 40001); assert.equal(s.explainer, 'student'); assert.equal(s.roundId, null);
  s = reduce(s, {a: 'switch'}, 'teacher', 40002); assert.equal(s.explainer, 'teacher');
});
test('16. connection lost and restored: the host re-sends the state, the round continues; actions while offline are not lost on the host', () => {
  // simulated data channel: host = teacher (applies actions), guest = student (renders the received state)
  let online = true; const net = []; const send = m => { if (online) net.push(JSON.parse(JSON.stringify(m))); };
  let host = reduce(round(newGame('g', 'thirty', {explainer: 'student'})), {a: 'begin'}, 'teacher', 0); send(wire(host, 0));
  let guest = fromWire(net.shift(), 0);
  online = false; host = reduce(host, {a: 'pause'}, 'teacher', 8000); send(wire(host, 8000)); // lost
  assert.equal(guest.phase, 'running', 'the student missed the pause');
  online = true; send(wire(host, 60000)); guest = fromWire(net.shift(), 70000); // "hello" after reconnect → state sent again
  assert.equal(guest.phase, 'paused'); assert.equal(remaining(guest, 75000), 22000, 'same time left as when paused');
  assert.equal(guest.roundId, 'r1', 'the explainer can reload the same cards (same round id)');
  host = reduce(host, {a: 'resume'}, 'student', 80000); assert.equal(host.phase, 'running');
});
test('ending and pausing are available to both players', () => {
  const s = reduce(round(newGame('g', 'thirty')), {a: 'begin'}, 'teacher', 0);
  assert.equal(reduce(s, {a: 'pause'}, 'student', 1).phase, 'paused');
  assert.equal(reduce(s, {a: 'end'}, 'student', 1).phase, 'ended');
});
