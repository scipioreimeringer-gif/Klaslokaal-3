// v65: Dutch verb overview (no translation), stored forms reused, big lists imported batch by batch (resumable).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
import {checkBatch, cleanGrammar} from '../../lib/vocab/detect.ts';
import {ownConjugations} from '../../lib/practice.ts';

// the canvas line builder, taken from the classroom page itself
const html = read('public/legacy/index.html');
const src = html.slice(html.indexOf('    var VG = [["noun"'), html.indexOf('    function vBlocks(list){'));
const {vLine} = new Function(src + '; return {vLine};')();
const V = (term, g, tr = 'to go') => ({term, translation: tr, pos: 'ww.', kind: 'word', grammar: {pos: 'verb', ...g}});

test('Dutch verbs on the canvas: infinitive · past sg / past pl · participle (H/Z), no translation', () => {
  assert.equal(vLine(V('gaan', {past_sg: 'ging', past_pl: 'gingen', participle: 'gegaan', aux: 'Z'})), 'gaan · ging / gingen · gegaan (Z)');
  assert.equal(vLine(V('afspreken', {past_sg: 'sprak af', past_pl: 'spraken af', participle: 'afgesproken', aux: 'H'})), 'afspreken · sprak af / spraken af · afgesproken (H)');
  assert.equal(vLine(V('zwemmen', {past_sg: 'zwom', past_pl: 'zwommen', participle: 'gezwommen', aux: 'H/Z'})), 'zwemmen · zwom / zwommen · gezwommen (H/Z)');
  assert.match(vLine(V('falar', {present: 'eu falo', participle: 'falado'}, 'to speak')), /to speak/, 'Portuguese verbs unchanged (with meaning)');
});

test('grammar: modal note kept, H/Z validated; nothing skipped silently in a batch', async () => {
  const g = cleanGrammar({index: 0, keep: true, translation: 'can', pos: 'verb', base: 'kunnen', article: '', plural: '', gender: '', present: 'kan', past_sg: 'kon', past_pl: 'konden', participle: 'gekund', aux: 'H', aux_note: 'vervangende infinitief: ik heb het niet kunnen doen', separable: 'no', conj_present: [], conj_past: [], inflected: '', comparative: '', superlative: '', kind: 'word'}, 'nl');
  assert.match(g.aux_note, /vervangende infinitief/);
  const ask = async (_s, _sys, user) => ({items: JSON.parse(user).candidates.map(c => ({index: c.index, keep: c.text !== 'Les 3', translation: 't', pos: 'noun', base: '', article: 'de', plural: '', gender: '', present: '', past_sg: '', past_pl: '', participle: '', aux: '', aux_note: '', separable: '', conj_present: [], conj_past: [], inflected: '', comparative: '', superlative: '', kind: 'word'}))});
  const c = t => ({term: t, translation: '', example: '', page: 'p', kind: 'word', reason: 'list'});
  const r = await checkBatch([c('fiets'), c('Les 3'), c('boom')], {targetName: 'Dutch', explainName: 'English', level: 'A2', ask, targetCode: 'nl'});
  assert.deepEqual(r.kept.map(x => x.term), ['fiets', 'boom']); assert.deepEqual(r.dropped.map(x => x.term), ['Les 3']);
});

test('stored forms are used in exercises (perfect with hebben/zijn, past tense)', () => {
  const own = [{id: 'g', term: 'gaan', translation: 'go', grammar: {pos: 'verb', past_sg: 'ging', past_pl: 'gingen', participle: 'gegaan', aux: 'Z'}}];
  const items = Array.from({length: 12}, (_, s) => ownConjugations(own, 'nl', 'A2', 1, s + 1)).flat();
  assert.ok(items.some(i => i.answers[0] === 'ben gegaan') && items.some(i => ['ging', 'gingen'].includes(i.answers[0])));
  assert.ok(items.every(i => i.answers[0] && i.prompt.includes('(gaan)')));
  assert.match(read('app/api/ai/exercises/route.ts'), /Learner's verbs with their forms \(use these exactly\)/);
});

test('big lists: one batch of 40 per request, progress stored, retries bounded, daily limit pauses, resume', () => {
  const v = read('lib/server/vocab.ts');
  assert.match(v, /export const IMPORT_BATCH = 40;/);
  assert.match(v, /from\('vocab_import_progress'\)\.upsert/);
  assert.match(v, /status: attempts >= 3 \? 'failed' : 'running'/);
  assert.match(v, /skipped_terms: \[\.\.\.p\.skipped_terms, \.\.\.res\.dropped\.map/, 'non-words are listed, not dropped silently');
  assert.match(html, /b\.vocab\(\{action:"batch", page:i\}\)/); assert.match(html, /b\.vocab\(\{action:"pending"\}\)/);
  assert.match(html, /Daglimiet bereikt: de import gaat later vanzelf verder\./);
  assert.match(read('supabase/v65.sql'), /create table if not exists public\.vocab_import_progress/);
  assert.match(read('lib/server/ai.ts'), /vocab: 250,/);
});
