// v62: canvas page menu, grammar word list, historical import in batches, one central word bank for all games.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
import {detectPages, cleanGrammar} from '../../lib/vocab/detect.ts';
import {canvasBlocks, candidatesFrom, pickRound, describable} from '../../lib/vocab/core.ts';
import {ownConjugations} from '../../lib/practice.ts';

const item = (index, o = {}) => ({index, keep: true, translation: 't' + index, pos: 'noun', base: '', article: '', plural: '', gender: '', present: '', past_sg: '', past_pl: '', participle: '', aux: '', aux_note: '', separable: '', conj_present: [], conj_past: [], inflected: '', comparative: '', superlative: '', kind: 'word', ...o});

test('a long historical list is processed in batches of 40 (not cut off), known words counted, unchanged pages skipped', async () => {
  const lines = Array.from({length: 130}, (_, i) => `<div class="b" data-t="li">woord${i}</div>`).join('');
  let calls = 0;
  const ask = async (_s, _sys, user) => { calls++; const c = JSON.parse(user).candidates; return {items: c.map(x => item(x.index))}; };
  const r = await detectPages([{title: 'Oude lijst', html: lines}], {existing: ['woord1', 'woord2'], scanned: new Set(), targetName: 'Dutch', explainName: 'English', level: 'A2', ask, targetCode: 'nl'});
  assert.equal(r.known, 2); assert.equal(r.suggestions.length, 128); assert.equal(calls, 4, '128 new words → 4 batches');
  const again = await detectPages([{title: 'Oude lijst', html: lines}], {existing: [], scanned: new Set(r.hashes.map(h => h.hash)), targetName: 'Dutch', explainName: 'English', level: 'A2', ask, targetCode: 'nl'});
  assert.equal(again.suggestions.length, 0, 'same content → no new AI call (content hash)');
});

test('pasted tables and tab lists become word = translation pairs', () => {
  const b = canvasBlocks('<div class="b"><table><tr><td>het huis</td><td>house</td></tr><tr><td>lopen</td><td>to walk</td></tr></table></div>');
  const c = candidatesFrom(b, 'p'); assert.deepEqual(c.map(x => [x.term, x.translation]), [['het huis', 'house'], ['lopen', 'to walk']]);
  assert.deepEqual(candidatesFrom([{type: 'p', text: 'de fiets\tbicycle'}], 'p').map(x => x.translation), ['bicycle']);
});

test('grammar is validated per language: Dutch H/Z only for Dutch, gender only where it exists', () => {
  const nlVerb = cleanGrammar(item(0, {pos: 'verb', present: 'loopt', past_sg: 'liep', past_pl: 'liepen', participle: 'gelopen', aux: 'H/Z', aux_note: 'zijn bij een richting', separable: 'no', conj_present: ['loop', 'loopt', 'loopt', 'lopen', 'lopen', 'lopen']}), 'nl');
  assert.equal(nlVerb.aux, 'H/Z'); assert.match(nlVerb.aux_note, /richting/); assert.equal(nlVerb.conj_present.length, 6);
  const ptVerb = cleanGrammar(item(0, {pos: 'verb', present: 'eu falo', participle: 'falado', aux: 'H', separable: 'yes', past_pl: 'x'}), 'pt');
  assert.ok(!('aux' in ptVerb) && !('separable' in ptVerb) && !('past_pl' in ptVerb), 'no Dutch rules on Portuguese');
  assert.equal(cleanGrammar(item(0, {article: 'a', plural: 'casas', gender: 'f'}), 'pt').gender, 'f');
  assert.ok(!('gender' in cleanGrammar(item(0, {article: 'het', plural: 'huizen', gender: 'f'}), 'nl')));
  assert.equal((cleanGrammar(item(0, {pos: 'verb', present: 'gaat', conj_present: ['a', 'b']}), 'nl') || {}).conj_present, undefined, 'incomplete conjugation is dropped');
});

test('games: one round never repeats a word; 30 Seconds/Taboe only describable words; conjugation never empty', () => {
  const W = (id, term, o = {}) => ({id, term, translation: 'x', example: '', status: 'new', lesson_date: '2026-11-01', created_at: '2026-11-01', correct_count: 0, wrong_count: 0, ...o});
  const r = pickRound([W('1', 'huis'), W('2', 'Huis'), W('3', 'fiets'), W('4', 'boom')], 4, new Set(), 1);
  assert.equal(r.length, 3); assert.equal(new Set(r.map(w => w.term.toLowerCase())).size, 3);
  assert.ok(describable({term: 'de fiets', pos: 'znw. · de'}) && !describable({term: 'met', pos: 'vz.'}) && !describable({term: 'Ik ga morgen naar de markt.', pos: ''}));
  const verbs = [{id: 'v', term: 'lopen', translation: 'walk', grammar: {pos: 'verb', conj_present: ['loop', 'loopt', 'loopt', 'lopen', 'lopen', 'lopen']}}, {id: 'x', term: 'gaan', translation: 'go', grammar: {pos: 'verb', conj_present: ['ga']}}, {id: 'n', term: 'huis', translation: 'h', grammar: {pos: 'noun'}}];
  const items = ownConjugations(verbs, 'nl', 'A1', 5, 3);
  assert.ok(items.length === 1 && items[0].answers[0] && /\(lopen\)/.test(items[0].prompt), 'only the verb with a complete conjugation');
  assert.ok(ownConjugations(verbs, 'pt', 'A1', 5, 3).every(i => !/^tu /.test(i.prompt)));
});

test('canvas: modern page menu, word list on a NEW page, import buttons, no AI per keystroke', () => {
  const h = read('public/legacy/index.html');
  assert.match(h, /class="pgm-btn" aria-haspopup="menu"/); assert.match(h, /pgMenu\.addEventListener\("mouseenter"/); assert.match(h, /e\.key === "ArrowDown"/);
  assert.match(h, /\.pgm-pop\{position:fixed;z-index:2147483000/, 'never clipped');
  assert.match(h, /created:new Date\(\)\.toISOString\(\), lesson:ls/, 'real dates only');
  assert.match(h, /addPage\(title, html\);   \/\* v62: always a NEW page/);
  assert.match(h, /"Deze pagina verwerken"/); assert.match(h, /"Alle Canvas-pagina's verwerken"/);
  assert.match(h, /vocabAutoT = setTimeout\(function\(\)\{ window\.__cvVocab\(false, true\); \}, 120000\)/);
  assert.match(read('supabase/v62.sql'), /grammar = coalesce\(v\.grammar, g\),\s+-- never overwrites/);
});
