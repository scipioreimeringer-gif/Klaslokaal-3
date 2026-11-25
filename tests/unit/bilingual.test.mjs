// v40 phase 2: bilingual lesson summaries — explanations translated, the student's own sentences never.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractTexts, applyTexts, switchLanguages, contentKey} from '../../lib/analysis/translate.ts';
import {compactAnalysis} from '../../lib/analysis/compact.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const ex = (o, c) => ({utterance_id: 'u', original: o, corrected: c, start: null, certainty: 'certain'});
const DOC = {
  version: 2, explanation_language: 'pt',
  report: {summary: 'Você falou sobre o fim de semana.', covered: ['perfeito'], went_well: ['Boa pronúncia'], focus: ['Artigos'], next_lesson: 'só professor'},
  categories: [{key: 'art', label: 'Artigos', topic_ids: [], count: 2, count_reliable: true, examples: [ex('het tafel', 'de tafel')], self_corrections: 0, slips: 0, relevance: 'current', recurring: false, trend: null, explanation: 'Tafel é uma palavra com de.'}],
};

test('only explanations are extracted — never the student sentence or its correction, never the teacher-only note', () => {
  const e = extractTexts(DOC);
  assert.deepEqual(e.texts, ['Você falou sobre o fim de semana.', 'perfeito', 'Boa pronúncia', 'Artigos', 'Artigos', 'Tafel é uma palavra com de.']);
  assert.ok(!e.texts.includes('het tafel') && !e.texts.includes('de tafel'));
  assert.ok(!e.texts.includes('só professor'));
});
test('applying a translation keeps the examples exactly and does not change the original document', () => {
  const e = extractTexts(DOC);
  const nl = ['Je vertelde over je weekend.', 'perfectum', 'Goede uitspraak', 'Lidwoorden', 'Lidwoorden', 'Tafel is een de-woord.'];
  const out = applyTexts(DOC, e, nl);
  assert.equal(out.report.summary, 'Je vertelde over je weekend.');
  assert.equal(out.categories[0].explanation, 'Tafel is een de-woord.');
  assert.deepEqual(out.categories[0].examples, DOC.categories[0].examples, 'original + correction untouched');
  assert.equal(DOC.report.summary, 'Você falou sobre o fim de semana.', 'source document not mutated');
  const c = compactAnalysis(out);
  assert.equal(c.points[0].wrong, 'het tafel'); assert.equal(c.points[0].right, 'de tafel'); assert.equal(c.points[0].tip, 'Tafel is een de-woord.');
});
test('an incomplete translation is ignored (no mixed or shifted texts)', () => {
  const e = extractTexts(DOC);
  assert.equal(applyTexts(DOC, e, ['only one']), DOC);
});
test('switch: lesson language first, then the student’s own language; one language → no switch', () => {
  assert.deepEqual(switchLanguages('pt', 'nl'), ['pt', 'nl']);
  assert.deepEqual(switchLanguages('nl', 'nl'), ['nl']);
  assert.deepEqual(switchLanguages('', 'en'), ['en']);
});
test('a teacher correction changes the content key → a new translation is made for the new version', () => {
  const a = contentKey(extractTexts(DOC).texts);
  const edited = {...DOC, categories: [{...DOC.categories[0], explanation: 'Tafel: de-woord (corrigido).'}]};
  assert.notEqual(contentKey(extractTexts(edited).texts), a);
});
test('route: access check, approved only, cache per language + version, AI only when missing, never examples', () => {
  const r = read('app/api/ai/translate-summary/route.ts');
  assert.match(r, /await studentAccess\(db, user\.id/);
  assert.match(r, /rpc\('student_lesson_summaries'/, 'approved, non-TEST summaries of this relation only');
  assert.match(r, /from\('analysis_translations'\)\.select\('texts'\)\.eq\('analysis_id', analysisId\)\.eq\('lang', lang\)\.eq\('content_hash', hash\)/);
  assert.ok(r.indexOf("from('analysis_translations').select") < r.indexOf('askFast('), 'cache checked before any AI call');
  assert.match(r, /if \(sourceLang\(doc\) === lang\) return/, /* v70: stored as a name */ 'no call for the language it was written in');
  assert.match(r, /JSON\.stringify\(ex\.texts\)/, 'only the extracted explanation texts are sent');
});
test('client: no translation until a language is chosen; only the opened card is translated; no page reload', () => {
  const a = read('components/Analysis.tsx');
  assert.match(a, /const need=v2&&!!lang&&lang!==src/);
  assert.match(a, /if\(!need\|\|!shown\|\|trCache\.has\(key\)\)return/);
  assert.match(a, /useExplainLang\(lessonLang\|\|'',studentId\)/, 'v70: choice remembered per student and learning language');
  assert.match(read('components/LessonCards.tsx'), /<LessonReport doc=\{doc\} studentId=\{viewer==='student'\?studentId:undefined\}/, 'v44: a report opens inside its own lesson page');
});
