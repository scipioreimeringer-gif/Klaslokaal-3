// v70: explanation language ("Uitlegtaal") on AI lesson reports — only explanation fields, cached, sentences untouched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractTexts, applyTexts, sourceLang} from '../../lib/analysis/translate.ts';
import {defaultExplainLang} from '../../lib/quiz.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');

const doc = {version: 2, explanation_language: 'Dutch', later_note: 'Later: conjunctief', report: {summary: 'Goede les', covered: [], went_well: [], focus: ['Let op lidwoorden']},
  categories: [{label: 'Lidwoorden', explanation: 'de/het', examples: [{original: 'het tafel', corrected: 'de tafel'}]}],
  errors: [{id: 'e1', original: 'ik heb gegaan', corrected: 'ik ben gegaan', why: 'gaan → zijn', start: 61, times: [61, 300], utterance_id: 'u7', status: 'approved'},
    {id: 'e2', original: 'x', corrected: 'y', why: 'weg', status: 'rejected'}],
  positives: [{utterance_id: 'u2', text: 'Ik ben blij', note: 'mooie zin'}]};

test('translates explanations, feedback, recommendations and summary; keeps sentences, timestamps and sources', () => {
  const ex = extractTexts(doc);
  assert.deepEqual(ex.texts, ['Goede les', 'Let op lidwoorden', 'Lidwoorden', 'de/het', 'Later: conjunctief', 'gaan → zijn', 'mooie zin']);
  const out = applyTexts(doc, ex, ex.texts.map(s => 'EN:' + s));
  assert.equal(out.report.summary, 'EN:Goede les'); assert.equal(out.errors[0].why, 'EN:gaan → zijn'); assert.equal(out.positives[0].note, 'EN:mooie zin'); assert.equal(out.later_note, 'EN:Later: conjunctief');
  assert.equal(out.errors[0].original, 'ik heb gegaan'); assert.equal(out.errors[0].corrected, 'ik ben gegaan');
  assert.deepEqual(out.errors[0].times, [61, 300]); assert.equal(out.errors[0].utterance_id, 'u7'); assert.equal(out.positives[0].text, 'Ik ben blij');
  assert.equal(out.categories[0].examples[0].original, 'het tafel');
  assert.equal(doc.errors[0].why, 'gaan → zijn', 'the stored report itself is never changed');
});

test('source language as a code (stored as a name); defaults: Dutch for my Portuguese profile, English for learners of Dutch', () => {
  assert.equal(sourceLang({explanation_language: 'Dutch'}), 'nl'); assert.equal(sourceLang({explanation_language: 'Brazilian Portuguese'}), 'pt'); assert.equal(sourceLang({explanation_language: 'en'}), 'en');
  assert.equal(defaultExplainLang('pt', 'nl'), 'nl'); assert.equal(defaultExplainLang('nl', 'nl'), 'en');
});

test('UI: dropdown on every report, remembered per student + learning language; server caches per language and content', () => {
  const a = read('components/Analysis.tsx');
  assert.match(a, /const \[lang,pick\]=useExplainLang\(lessonLang\|\|'',studentId\);/);
  assert.match(a, /<ExplainLangSelect value=\{lang\} onChange=\{onLang\} label="Uitlegtaal"\/>/);
  assert.match(read('components/ExplainLang.tsx'), /const own = studentId \? keyOf\(learning\) \+ '-' \+ studentId : '';/);
  const r = read('app/api/ai/translate-summary/route.ts');
  assert.match(r, /if \(cached\.data\?\.texts\) return Response\.json\(\{texts: cached\.data\.texts, cached: true\}\);/, 'a language switch never repeats an AI call');
  assert.match(r, /if \(sourceLang\(doc\) === lang\) return/);
});
