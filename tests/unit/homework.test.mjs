// v40 phase 3+4: compact homework generator ("Vanuit mijn les" / "Zelf kiezen"), lesson topics, and the dropdown.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lessonMaterial, proposeTopics} from '../../lib/analysis/material.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const ex = (o, c, certainty = 'certain') => ({original: o, corrected: c, certainty});
const V2 = {version: 2, report: {covered: ['Perfectum met zijn'], went_well: [], focus: [], summary: ''}, vocabulary: [{term: 'de afspraak'}, {term: 'gezellig'}],
  categories: [
    {label: 'Perfectum', relevance: 'current', recurring: true, examples: [ex('ik heb gegaan', 'ik ben gegaan')]},
    {label: 'Conjunctief', relevance: 'later', examples: [ex('x', 'y')]},
    {label: 'Lidwoorden', relevance: 'known', examples: [ex('het tafel', 'de tafel', 'uncertain')]},
  ]};
const V1 = {corrections: [{original: 'zij eet de brood', corrected: 'zij eet het brood', category: 'grammar'}, {original: 'twijfel', corrected: 'x', certainty: 'uncertain'}], grammar: [{topic: 'Lidwoorden'}]};

test('bug fix: errors from AI analysis 2.0 (categories) are used for homework, not only old v1 corrections', () => {
  const m = lessonMaterial([V2]);
  assert.deepEqual(m.errors, [{original: 'ik heb gegaan', corrected: 'ik ben gegaan', category: 'Perfectum'}]);
  assert.deepEqual(m.grammar, ['Perfectum met zijn']); assert.deepEqual(m.vocab, ['de afspraak', 'gezellig']); assert.deepEqual(m.repeat, ['Perfectum']);
});
test('never homework on material that is not covered yet ("later") or on uncertain examples', () => {
  const m = lessonMaterial([V2]);
  assert.ok(!m.errors.some(e => e.category === 'Conjunctief' || e.original === 'het tafel'));
});
test('old v1 summaries keep working', () => {
  const m = lessonMaterial([V1]);
  assert.deepEqual(m.errors.map(e => e.original), ['zij eet de brood']); assert.deepEqual(m.grammar, ['Lidwoorden']);
});
test('teacher-confirmed lesson topics come first; unconfirmed proposals are not used as confirmed', () => {
  const confirmed = {...V2, lesson_topics: {grammar: ['Inversie'], vocab: ['de fiets'], errors: ['ik ga morgen naar huis gisteren'], repeat: ['Woordvolgorde'], instructions: 'Kort en simpel', confirmed_at: '2026-11-18T10:00:00Z'}};
  const m = lessonMaterial([confirmed]);
  assert.ok(m.confirmed); assert.equal(m.grammar[0], 'Inversie'); assert.equal(m.vocab[0], 'de fiets'); assert.equal(m.instructions, 'Kort en simpel');
  const draft = {...V2, lesson_topics: {...confirmed.lesson_topics, confirmed_at: null}};
  assert.ok(!lessonMaterial([draft]).confirmed); assert.ok(!lessonMaterial([draft]).grammar.includes('Inversie'));
});
test('AI proposal for "Lesonderwerpen" comes from the analysis itself (no extra AI call)', () => {
  const p = proposeTopics(V2);
  assert.deepEqual(p.grammar, ['Perfectum met zijn']); assert.deepEqual(p.errors, ['ik heb gegaan → ik ben gegaan']); assert.equal(p.confirmed_at, null);
});

test('route: "Vanuit mijn les" uses the chosen lesson (or the latest) as the source', () => {
  const r = read('app/api/ai/exercises/route.ts');
  assert.match(r, /const fromLesson = body\.source === 'lesson';/);
  assert.match(r, /summaries\.filter\(s => s\.lesson_date === lessonDate\) : summaries\.slice\(0, 1\)/);
  assert.match(r, /lessonMaterial\(picked\.map\(s => s\.final\)\)/);
  assert.match(r, /await enforceLimit\(db, user\.id, 'exercises'\)/, 'usage limit still applies');
});
test('form: compact card, default "Vanuit mijn les", 5–30 min, all exercise types, AI only on the button, no double request, reuse', () => {
  const l = read('components/Learning.tsx');
  assert.match(l, /useState<'lesson'\|'own'>\(initialTopic\?'own':'lesson'\)/, 'v43: default Vanuit mijn les, unless opened from a report topic');
  assert.match(l, /\[5,10,15,20,30\]/);
  for (const k of ['woordenschat', 'grammatica', 'vertalen', 'invullen', 'meerkeuze', 'werkwoorden', 'fouten', 'zinnen', 'schrijven', 'lezen', 'gemengd']) assert.ok(l.includes(k + ':'), k);
  assert.match(l, /if\(inFlight\.current\)return;/, 'double click ignored');
  assert.match(l, /if\(!force&&exCache\.has\(key\)\)\{setReused\(true\)/, 'same choices → same set, no AI call');
  const f = l.slice(l.indexOf('export function ExerciseForm'), l.indexOf('export function ExercisePlayer'));
  assert.equal((f.match(/authedPost/g) || []).length, 1, 'one AI request path, only from go()');
  assert.ok(!/useEffect\([^)]*authedPost/.test(f), 'never on opening');
});
test('teacher homework tab: card always visible; manual assignment folded; student self-practice is not official homework', () => {
  const h = read('app/huiswerk-client.tsx');
  assert.match(h, /\{!aiSet&&<ExerciseForm studentId=\{studentId\} teacher onReady=\{setAiSet\}\/>\}/);
  assert.match(h, /<details className="hw-manual">/);
  assert.match(h, /origin:'ai'\}\)/, 'AI homework is saved as a draft for the teacher to check');
  assert.match(read('app/oefenen/page.tsx'), /geen officieel huiswerk van je docent/);
});

test('dropdown: one reusable component with keyboard, screen-reader and positioning support; no new dependency', () => {
  const s = read('components/Select.tsx');
  for (const k of ["'ArrowDown'", "'ArrowUp'", "'Home'", "'End'", "'Escape'", "'Enter'"]) assert.ok(s.includes(k), k);
  assert.match(s, /role="combobox" aria-haspopup="listbox" aria-expanded=\{open\}/);
  assert.match(s, /role="option" aria-selected=\{sel\}/);
  assert.match(s, /aria-activedescendant=/);
  assert.match(s, /setUp\(window\.innerHeight-r\.bottom<need&&r\.top>need\)/, 'opens upwards when there is no room below');
  assert.match(s, /document\.addEventListener\('mousedown',off\)/, 'closes on outside click');
  const pkg = JSON.parse(read('package.json'));
  assert.ok(!Object.keys({...pkg.dependencies, ...pkg.devDependencies}).some(d => /select|headless|radix|downshift/i.test(d)));
  assert.match(read('app/layout.tsx'), /Plus_Jakarta_Sans/);
  assert.ok(!/next\/font\/google';[\s\S]*Inter\(/.test(read('app/layout.tsx')), 'one font family (Inter replaced, not added)');
});
