import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeSpeakers, formatDialogue, speakingTime} from '../../lib/transcript.ts';

test('teacher and student tracks merge chronologically with speaker labels', () => {
  const lines = mergeSpeakers(
    [{start: 0, end: 3, text: 'Oi! Como foi seu fim de semana?'}, {start: 9, end: 11, text: 'Fui, não vai.'}],
    [{start: 4, end: 8, text: 'Ontem eu vai ao mercado.'}, {start: 12, end: 12.5, text: 'hm'}, {start: 13, end: 15, text: 'Ah, eu fui!'}]);
  assert.deepEqual(lines.map(l => l.speaker + ':' + l.text), ['DOCENT:Oi! Como foi seu fim de semana?', 'LEERLING:Ontem eu vai ao mercado.', 'DOCENT:Fui, não vai.', 'LEERLING:hm', 'LEERLING:Ah, eu fui!']);
  assert.equal(formatDialogue(lines).split('\n')[1], '[00:04] LEERLING: Ontem eu vai ao mercado.');
});
test('noise-only segments are dropped', () => {
  assert.equal(mergeSpeakers([{start: 0, end: 1, text: ' . '}], [{start: 1, end: 2, text: '...'}]).length, 0);
});
test('speaking time is the sum of segment durations', () => {
  assert.equal(speakingTime([{start: 4, end: 8, text: 'a'}, {start: 13, end: 15.4, text: 'b'}]), 6);
  assert.equal(speakingTime([]), 0);
});
test('long dialogues are truncated with a marker', () => {
  const many = Array.from({length: 50}, (_, i) => ({start: i, end: i + 1, text: 'frase número ' + i}));
  assert.match(formatDialogue(mergeSpeakers(many, []), 200), /ingekort/);
});
