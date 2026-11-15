import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nlForms, drillSet, blankSentence} from '../../lib/conjugation.ts';

test('Dutch forms incl. perfect with the right auxiliary and common variants', () => {
  assert.deepEqual(nlForms('zijn', 'presens').map(f => f[0]), ['ben', 'bent', 'is', 'zijn']);
  assert.deepEqual(nlForms('gaan', 'perfectum')[2], ['is gegaan']);
  assert.deepEqual(nlForms('maken', 'perfectum')[0], ['heb gemaakt']);
  assert.ok(nlForms('kunnen', 'presens')[1].includes('kan') && nlForms('kunnen', 'presens')[1].includes('kunt'));
  assert.ok(nlForms('willen', 'imperfectum')[0].includes('wou'));
});
test('drill sets: deterministic, right size, Portuguese answers from the verb table', () => {
  const a = drillSet('pt', 8, 42), b = drillSet('pt', 8, 42);
  assert.equal(a.length, 8); assert.deepEqual(a, b);
  assert.ok(a.every(x => x.answers[0] && x.person && x.tense));
  assert.equal(drillSet('fr', 5, 1).length, 0);
});
test('blank sentence for fill-in game', () => {
  assert.equal(blankSentence('Valeu a pena ir ao show.', 'valer a pena'), null);
  assert.equal(blankSentence('Ainda não terminei.', 'ainda'), '_____ não terminei.');
});
