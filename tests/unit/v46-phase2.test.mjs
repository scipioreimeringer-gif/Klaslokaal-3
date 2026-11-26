// v46 phase 2: every demonstrable error (with main category, reason, time, pattern), teacher review, central word list.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {errorType, errorsOf, groupErrors, verifyErrors, ERROR_TYPES, ERROR_TYPE_LABEL} from '../../lib/analysis/core.ts';
import {filterVocab, vocabFacets} from '../../lib/vocab/filter.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');

test('main categories: the fixed list from the assignment, derived when the model gives none', () => {
  assert.deepEqual(ERROR_TYPES.map(t => ERROR_TYPE_LABEL[t]), ['Grammatica', 'Werkwoordvervoegingen', 'Woordvolgorde en zinsbouw', 'Verkeerd woordgebruik', 'Ontbrekende woorden', 'Lidwoorden', 'Voorzetsels', 'Uitspraak', 'Overig']);
  assert.equal(errorType('article', 'whatever'), 'article');
  assert.equal(errorType(null, 'Inversie'), 'word_order'); assert.equal(errorType(undefined, 'Hulpwerkwoord hebben/zijn'), 'conjugation');
  assert.equal(errorType('nonsense', 'de/het'), 'article'); assert.equal(errorType(null, 'Ontbrekend woord'), 'missing_word');
  assert.equal(errorType(null, 'Iets onbekends'), 'grammar');
});
test('teacher speech never counts; pronunciation from a transcript is never "certain"; one error once per line', () => {
  const byId = new Map([['u1', {id: 'u1', speaker: 'student', text: 'Ik heb gisteren gegaan naar huis.', start: 12, pos: 0}], ['u2', {id: 'u2', speaker: 'teacher', text: 'Niet ik heb gegaan, maar ik ben gegaan.', start: 15, pos: 1}]]);
  const e = (u, original, category, type) => ({utterance_id: u, original, corrected: 'x', category, topic_id: null, kind: 'error', certainty: 'certain', type});
  const {kept} = verifyErrors([e('u1', 'heb gisteren gegaan', 'Hulpwerkwoord'), e('u1', 'heb gisteren gegaan', 'hebben/zijn'), e('u2', 'ik heb gegaan', 'Hulpwerkwoord'), e('u1', 'huis', 'Uitspraak', 'pronunciation')], byId, true);
  assert.equal(kept.length, 2, 'duplicate in the same line merged, teacher line dropped');
  assert.equal(kept.find(k => k.type === 'pronunciation').certainty, 'uncertain');
  assert.equal(kept[0].start, 12, 'time code kept');
});
test('older reports keep working: their examples count as approved errors; grouping per main category', () => {
  const old = {categories: [{key: 'inversion', label: 'Inversie', topic_ids: [], count: 3, count_reliable: true, explanation: 'Werkwoord op plek 2.', relevance: 'current', self_corrections: 0, slips: 0, recurring: false, trend: null,
    examples: [{utterance_id: 'u1', original: 'gisteren ik ben', corrected: 'gisteren ben ik', start: 3, certainty: 'certain'}]}]};
  const errs = errorsOf(old);
  assert.equal(errs.length, 1); assert.equal(errs[0].status, 'approved'); assert.equal(errs[0].type, 'word_order'); assert.equal(errs[0].why, 'Werkwoord op plek 2.');
  assert.deepEqual(groupErrors(errs).map(g => g.label), ['Woordvolgorde en zinsbouw']);
  assert.deepEqual(errorsOf(null), []);
});
test('pipeline: all mistakes (max 60 per part) with type, reason, word; analysis of the whole transcript in parts', () => {
  const p = read('lib/analysis/pipeline.ts');
  assert.match(p, /\.describe\('ALL reliably recognisable mistakes of the student in this part \(max 60\), each mistake once per line; style remarks max 10'\)/); // v72 wording
  assert.match(p, /'Register EVERY reliably recognisable, didactically relevant mistake of the student in this part \(not just a few striking ones\)/); // v72
  assert.match(p, /r\.errors\.slice\(0, 120\)/); // v72: two halves of a split part
  assert.match(p, /errors: ctx\.previous\?\.length \? carryDecisions\(merged\.errors, ctx\.previous\) : merged\.errors,/);
  assert.match(p, /'Pronunciation only when the transcript makes it unmistakable/);
  assert.match(p, /Do not flag correct, natural informal speech\./, 'informal speech is not an error (kept)');
});
test('report: "Fouten en verbeteringen" grouped with details; student never sees removed or "later" errors; teacher reviews', () => {
  const r = read('components/ErrorReview.tsx');
  assert.match(r, /export const visibleErrors = \(doc: AnalysisV2\) => errorsOf\(doc\)\.filter\(e => e\.status !== 'rejected' && !e\.later\);/);
  assert.match(r, /<details key=\{g\.type\} className="er-group"/);
  assert.match(r, /onChange\(\{\.\.\.e, status: 'approved'\}\)/); assert.match(r, /onChange\(\{\.\.\.e, status: 'rejected'\}\)/);
  assert.match(r, /onChange\(\{\.\.\.d, corrected: d\.corrected\.trim\(\) \|\| e\.corrected, status: 'approved', edited: true\}\)/, 'correct = approve the corrected version');
  assert.match(r, /if \(!doc\.speakers_separated\) return tt\('Docent en leerling waren in deze opname niet apart te horen/, 'incomplete source said clearly');
  assert.match(read('components/LessonReport.tsx'), /<Section n=\{1\} icon=\{XCircle\} title=\{tt\("Fouten en verbeteringen"\)\} tone="coral">/);
  assert.match(read('components/AnalysisV2.tsx'), /<ErrorList doc=\{doc\} teacher onChange=\{errs=>\{const next=\{\.\.\.doc,errors:errs,/, 'saved in the existing analysis (draft + final)');
});
test('central word list: canvas, AI report and corrected mistakes → one list via vocab_merge; old behaviour without v47', () => {
  const a = read('lib/server/analysisRunner.ts');
  assert.match(a, /db\.rpc\('vocab_merge', \{\.\.\.base, p_source: 'ai', p_items: \(doc\.vocabulary \|\| \[\]\)/);
  assert.match(a, /\(doc\.errors \|\| \[\]\)\.filter\(e => e\.word && e\.certainty === 'certain' && !e\.later\)/);
  assert.match(a, /p_source: 'error', p_items: errWords/);
  assert.match(a, /\/\/ database update v47 not run yet: the previous behaviour/);
  assert.match(read('lib/server/vocab.ts'), /db\.rpc\('vocab_merge', \{p_student: student\.id, p_source: 'canvas'/);
  const v = read('supabase/v47.sql').replace(/--.*$/gm, '');
  assert.ok(!/\bdelete from\b|\bdrop table\b|\btruncate\b/i.test(v), 'non-destructive');
});
test('Woorden: grouped per word class; lesson filter covers every lesson a word appeared in', () => {
  const items = [{term: 'lopen', status: 'new', pos: 'ww.', lesson_date: '2026-11-01', lesson_dates: ['2026-11-01', '2026-11-20']}, {term: 'de fiets', status: 'new', pos: 'znw. · de', lesson_date: '2026-11-20'}];
  assert.deepEqual(filterVocab(items, {lesson: '2026-11-20'}).map(i => i.term), ['lopen', 'de fiets']);
  assert.deepEqual(filterVocab(items, {lesson: '2026-11-01'}).map(i => i.term), ['lopen']);
  assert.deepEqual(vocabFacets(items).lessons, ['2026-11-20', '2026-11-01']);
  const l = read('components/Learning.tsx');
  assert.match(l, /\{\/\* v46: grouped per word class \*\/\}\{POS_GROUP_ORDER\.map\(k=>\[k,shown\.filter\(v=>posKindOf\(v\.pos\)===k\)\] as const\)/);
  assert.match(l, /db\.from\('vocab_lessons'\)\.select\('vocab_id,lesson_date'\)\.eq\('student_id',studentId\)/);
});
