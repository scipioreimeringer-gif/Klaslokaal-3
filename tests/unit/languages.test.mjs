import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildLanguageCards, cardStats, pickRelation, languageName, ownLearningCards} from '../../lib/languages.ts';

const rel = (id, teacher_id, extra = {}) => ({id, teacher_id, subject: '', curriculum_subject: null, lesson_language: null, level: null, ...extra});

test('scenario 1: one self-study language without teacher', () => {
  const cards = buildLanguageCards([], [{id: 's1', language: 'es', level: 'A1'}]);
  assert.equal(cards.length, 1);
  assert.deepEqual([cards[0].code, cards[0].level, cards[0].relations.length, !!cards[0].self], ['es', 'A1', 0, true]);
});

test('scenario 2: two languages, each its own card', () => {
  const cards = buildLanguageCards([rel('a', 'T', {curriculum_subject: 'pt', level: 'A2'}), rel('b', 'T', {curriculum_subject: 'nl', level: 'B1'})], []);
  assert.deepEqual(cards.map(c => c.code).sort(), ['nl', 'pt']);
});

test('scenario 3/4: two teachers for the same language stay separate relations in one card', () => {
  const cards = buildLanguageCards([rel('a', 'Tom', {subject: 'Portugees'}), rel('b', 'Ana', {curriculum_subject: 'pt'})], []);
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].relations.map(r => r.id), ['a', 'b']);
});

test('self-study language merges with the same language from a teacher', () => {
  const cards = buildLanguageCards([rel('a', 'Tom', {curriculum_subject: 'pt', level: 'A2'})], [{id: 's', language: 'pt', level: 'A1'}]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].level, 'A2', 'teacher level wins over self-reported level');
  assert.ok(cards[0].self);
});

test('languages with a teacher come first', () => {
  const cards = buildLanguageCards([rel('a', 'T', {curriculum_subject: 'pt'})], [{id: 's', language: 'de', level: null}, {id: 's2', language: 'en', level: null}]);
  assert.deepEqual(cards.map(c => c.code), ['pt', 'de', 'en']);
});

test('stats only count rows of the card\'s own relations; no words → null (not 0%)', () => {
  const [pt, nl] = buildLanguageCards([rel('a', 'T', {curriculum_subject: 'pt'}), rel('b', 'T', {curriculum_subject: 'nl'})], []).sort((x, y) => x.code < y.code ? 1 : -1);
  const lessons = [{student_id: 'a'}, {student_id: 'a'}, {student_id: 'b'}];
  const vocab = [{student_id: 'a', status: 'mastered'}, {student_id: 'a', status: 'new'}, {student_id: 'x', status: 'mastered'}];
  assert.deepEqual(cardStats(pt, lessons, vocab), {lessons: 2, words: 2, mastered: 1, pct: 50});
  assert.deepEqual(cardStats(nl, lessons, vocab), {lessons: 1, words: 0, mastered: 0, pct: null});
});

test('pickRelation keeps the requested teacher only when it belongs to the language', () => {
  const [card] = buildLanguageCards([rel('a', 'Tom', {curriculum_subject: 'pt'}), rel('b', 'Ana', {curriculum_subject: 'pt'})], []);
  assert.equal(pickRelation(card, 'b').id, 'b');
  assert.equal(pickRelation(card, 'zzz').id, 'a');
  assert.equal(pickRelation(undefined, 'a'), null);
});

test('language names', () => {
  assert.equal(languageName('pt'), 'Portugees (Brazilië)');
  assert.equal(languageName('xx'), 'XX');
});

test('own learning languages: never what I teach; same list for dashboard and sidebar', () => {
  const me = 'me';
  const rels = [
    rel('a', 'ana', {curriculum_subject: 'pt', user_id: me}),         // I learn Portuguese with Ana
    rel('b', me, {curriculum_subject: 'nl', user_id: me}),            // my own test student (I teach myself)
    rel('c', me, {curriculum_subject: 'nl', user_id: 'madison'}),     // I teach Dutch to Madison
  ];
  assert.deepEqual(ownLearningCards(rels, [], me).map(c => c.code), ['pt']);
  assert.deepEqual(ownLearningCards(rels, [{id: 's', language: 'nl', level: null}], me).map(c => c.code), ['pt', 'nl'], 'only a self-added language can add Dutch');
  assert.deepEqual(ownLearningCards(rels, [], 'madison').map(c => c.code), ['nl'], 'Madison sees the Dutch I teach her');
});