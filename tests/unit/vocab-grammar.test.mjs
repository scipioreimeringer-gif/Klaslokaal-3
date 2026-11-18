// v40 phase 8: smarter AI vocabulary (grammar labels per language) and teacher-only AI for canvas words.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {grammarLabel, posIcon} from '../../lib/vocab/grammar.ts';
import {detectPages} from '../../lib/vocab/detect.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');

test('compact labels: nouns with article (+ plural), verbs, adjectives, expressions, example sentences', () => {
  assert.equal(grammarLabel({pos: 'noun', article: 'het', plural: 'broden'}, 'nl'), 'znw. · het · mv. broden');
  assert.equal(grammarLabel({pos: 'noun', article: 'de'}, 'nl'), 'znw. · de');
  assert.equal(grammarLabel({pos: 'verb'}, 'nl'), 'ww.');
  assert.equal(grammarLabel({pos: 'adjective'}, 'nl'), 'bnw.');
  assert.equal(grammarLabel({pos: 'expression'}, 'nl'), 'uitdrukking');
  assert.equal(grammarLabel({pos: 'sentence'}, 'nl'), 'voorbeeldzin');
  assert.equal(grammarLabel({pos: 'verb', article: 'de'}, 'nl'), 'ww.', 'article only for nouns');
});
test('labels follow the explanation language; grammar follows the lesson language', () => {
  assert.equal(grammarLabel({pos: 'noun', article: 'o', plural: 'pães'}, 'pt'), 'subst. · o · pl. pães');
  assert.equal(grammarLabel({pos: 'noun', article: 'das'}, 'de'), 'Subst. · das');
  assert.equal(grammarLabel({pos: 'verb'}, 'en'), 'v.');
  assert.equal(grammarLabel({pos: 'verb'}, 'xx'), 'v.', 'unknown language → English');
  for (const l of ['nl', 'en', 'pt', 'es', 'fr', 'de']) assert.ok(grammarLabel({pos: 'noun', article: 'abcdefghijk', plural: 'x'.repeat(60)}, l).length <= 40, l + ': fits the pos column');
});
test('icons: 📘 noun, ⚡ verb, 🎨 adjective, 💬 expression/sentence; old words without a label keep working', () => {
  assert.equal(posIcon('znw. · het'), '📘'); assert.equal(posIcon('ww.'), '⚡'); assert.equal(posIcon('bnw.'), '🎨');
  assert.equal(posIcon('uitdrukking'), '💬'); assert.equal(posIcon('Beispielsatz'), '💬'); assert.equal(posIcon('verbo'), '⚡');
  assert.equal(posIcon(null), ''); assert.equal(posIcon(''), ''); assert.equal(posIcon('zelfstandig naamwoord'), '', 'old free-text label: no icon, still shown');
});
test('canvas recognition stores the label; plural left out at A0/A1; the term itself is never changed by AI', async () => {
  const ask = async () => ({items: [{index: 0, keep: true, translation: 'bread', pos: 'noun', article: 'het', plural: 'broden', kind: 'word'}]});
  const page = {title: 'Woorden', html: '<div class="b" data-t="li">het brood = bread</div><div class="b" data-t="li">de tafel</div><div class="b">Ik eet brood.</div>'};
  const base = {existing: [], scanned: new Set(), targetName: 'Dutch', explainName: 'Dutch', explainCode: 'nl', ask};
  const b1 = await detectPages([page], {...base, level: 'B1'});
  const a1 = await detectPages([page], {...base, level: 'A1'});
  assert.equal(b1.suggestions.length, 1);
  assert.equal(b1.suggestions[0].term, 'het brood', 'term from the canvas, not from AI');
  assert.equal(b1.suggestions[0].pos, 'znw. · het · mv. broden');
  assert.equal(a1.suggestions[0].pos, 'znw. · het', 'no plural at A1');
  assert.match(read('lib/vocab/detect.ts'), /pos: z\.enum\(\['noun', 'verb', 'adjective', 'adverb', 'expression', 'sentence', 'other'\]\)/);
});
test('"✨ Woorden" (canvas): infinitive, singular + article, adjective base form, expressions and example sentences; conjugations only from A2', () => {
  const ai = read('pages/api/ai.js');
  assert.match(ai, /bijvoeglijk naamwoorden in de basisvorm/);
  assert.match(ai, /soort "voorbeeldzin"/);
  assert.match(ai, /function trimForLevel\(result, level\) \{\s*if \(!\/\^A\[01\]\$\/\.test\(level\)\) return result;/);
  assert.match(ai, /result: trimForLevel\(result, level\)/);
  assert.match(ai, /definite article of \$\{lessonLanguage\}/, 'other lesson languages get their own grammar');
  const html = read('public/legacy/index.html');
  assert.match(html, /"⚡ <b>" \+ esc\(w\.infinitief\)/); assert.match(html, /"📘 <b>" \+ esc\(\(w\.lidwoord/); assert.match(html, /"🎨 <b>" \+ esc\(w\.woord\)/);
});
test('teacher/admin only: server checks the role; student never sees the AI buttons', () => {
  const ai = read('pages/api/ai.js');
  assert.match(ai, /data\.role === "teacher" \|\| data\.role === "admin"/);
  assert.match(ai, /if \(!passOk && !\(await isSupabaseTeacher\(req\)\)\) return res\.status\(401\)/);
  assert.match(read('app/api/vocab/detect/route.ts'), /if \(role !== 'teacher'\) throw new HttpError\(403/);
  assert.match(read('app/api/ai/tidy/route.ts'), /if \(role !== 'teacher'\) throw new HttpError\(403/);
  const html = read('public/legacy/index.html');
  assert.match(html, /id="aiCanvasWords" data-teacher/); assert.match(html, /id="tidyBtn" data-teacher/);
});
