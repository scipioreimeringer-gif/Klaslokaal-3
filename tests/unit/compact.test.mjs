// v38 phase 4: compact lesson analysis (max 3 points, ❌/✅ + tip) and "Voor jou klaar" on the student dashboard.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compactAnalysis, firstSentence} from '../../lib/analysis/compact.ts';
import {readyFor, hasReady} from '../../lib/ready.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const ex = (o, c, certainty = 'certain') => ({utterance_id: 'u', original: o, corrected: c, start: null, certainty});
const cat = (key, p) => ({key, label: key, topic_ids: [], count: 1, count_reliable: true, examples: [], self_corrections: 0, slips: 0, relevance: 'relevant', recurring: false, trend: null, explanation: '', ...p});
const V2 = {
  version: 2,
  report: {summary: 'Je hebt over je weekend verteld. Je sprak al vlot. Dit derde zinnetje valt weg.', covered: [], went_well: ['Goede uitspraak van de g.', 'Veel nieuwe woorden gebruikt.', 'Derde'], focus: [], next_lesson: 'alleen voor docent'},
  categories: [
    cat('woordvolgorde', {count: 2, relevance: 'known', examples: [ex('Gisteren ik ben gegaan', 'Gisteren ben ik gegaan')], explanation: 'Na een tijdsbepaling komt eerst het werkwoord. Daarna het onderwerp.'}),
    cat('perfectum', {count: 5, relevance: 'current', recurring: true, examples: [ex('ik heb gegaan', 'ik ben gegaan', 'uncertain'), ex('ik heb gekomen', 'ik ben gekomen')], explanation: 'Werkwoorden van beweging naar een plek krijgen "zijn".'}),
    cat('lidwoorden', {count: 3, relevance: 'new_today', examples: [ex('het tafel', 'de tafel')], explanation: 'Tafel is een de-woord.'}),
    cat('meervoud', {count: 4, relevance: 'relevant', examples: [ex('twee boek', 'twee boeken')], explanation: 'Na een getal: meervoud.'}),
    cat('conjunctief', {count: 9, relevance: 'later', examples: [ex('x', 'y')], explanation: 'nog niet behandeld'}),
    cat('zonder voorbeeld', {count: 7, relevance: 'current', examples: [], explanation: 'geen letterlijke zin'}),
  ],
};

test('at most 3 points, most relevant first (lesson goal, explained today, already covered)', () => {
  const c = compactAnalysis(V2);
  assert.equal(c.points.length, 3);
  assert.deepEqual(c.points.map(p => p.label), ['perfectum', 'lidwoorden', 'woordvolgorde']);
  assert.equal(c.morePoints, 1, 'the 4th point is behind "Meer details"');
});
test('each point: ❌ what the student said, ✅ the correction, one short tip', () => {
  const p = compactAnalysis(V2).points[0];
  assert.equal(p.wrong, 'ik heb gekomen', 'a certain example is preferred over an uncertain one');
  assert.equal(p.right, 'ik ben gekomen');
  assert.equal(p.tip, 'Werkwoorden van beweging naar een plek krijgen "zijn".');
  assert.equal(compactAnalysis(V2).points[2].tip, 'Na een tijdsbepaling komt eerst het werkwoord.', 'only the first sentence');
  assert.ok(p.recurring);
});
test('never shown: "later" material, categories without a verbatim example, the teacher-only next-lesson note', () => {
  const c = compactAnalysis(V2, {max: 10});
  assert.ok(!c.points.some(p => p.label === 'conjunctief' || p.label === 'zonder voorbeeld'));
  assert.ok(!JSON.stringify(c).includes('alleen voor docent'));
});
test('short summary (max. 2 sentences) and at most 2 things that went well', () => {
  const c = compactAnalysis(V2);
  assert.equal(c.summary, 'Je hebt over je weekend verteld. Je sprak al vlot.');
  assert.deepEqual(c.wentWell, ['Goede uitspraak van de g.', 'Veel nieuwe woorden gebruikt.']);
});
test('older analyses (v1) work too: grouped per category, no invented "went well"', () => {
  const v1 = {summary: 'Les over eten.', practiced: ['bestellen'], corrections: [
    {original: 'ik wil een koffie', corrected: 'ik wil graag een koffie', explanation: 'Beleefder met graag. Extra.', category: 'word_choice'},
    {original: 'hij drinkt de thee', corrected: 'hij drinkt thee', explanation: 'Geen lidwoord.', category: 'grammar', certainty: 'uncertain'},
    {original: 'zij eet de brood', corrected: 'zij eet het brood', explanation: 'Brood is een het-woord.', category: 'grammar'},
  ]};
  const c = compactAnalysis(v1, {label: k => ({grammar: 'Grammatica', word_choice: 'Woordkeuze'})[k]});
  assert.deepEqual(c.points.map(p => p.label), ['Grammatica', 'Woordkeuze']);
  assert.equal(c.points[0].wrong, 'zij eet de brood', 'certain example first');
  assert.equal(c.points[1].tip, 'Beleefder met graag.');
  assert.deepEqual(c.wentWell, []);
});
test('nothing relevant → no points (the view then says so), long tips are cut at a word', () => {
  assert.equal(compactAnalysis({...V2, categories: []}).points.length, 0);
  const long = firstSentence('Dit is een hele lange uitleg zonder punt ' + 'woord '.repeat(60), 60);
  assert.ok(long.length <= 61 && long.endsWith('…'));
});

const DATA = {
  students: [{id: 'r1'}, {id: 'r2'}],
  assignments: [
    {id: 'a1', student_id: 'r1', title: 'Perfectum oefenen', published_at: '2026-11-10T10:00:00Z'},
    {id: 'a2', student_id: 'r1', title: 'Al ingeleverd', published_at: '2026-11-09T10:00:00Z'},
    {id: 'a3', student_id: 'r1', title: 'Concept', published_at: null},
    {id: 'a4', student_id: 'r2', title: 'Ander vak', published_at: '2026-11-11T10:00:00Z'},
  ],
  submissions: [{assignment_id: 'a2'}],
  vocab: [
    {student_id: 'r1', status: 'new', due_at: '2026-11-01T00:00:00Z', translation: 'bike'},
    {student_id: 'r1', status: 'practicing', due_at: '2026-12-30T00:00:00Z', translation: 'house'},
    {student_id: 'r1', status: 'new', due_at: '2026-11-01T00:00:00Z', translation: ''},
    {student_id: 'r2', status: 'new', due_at: '2026-11-01T00:00:00Z', translation: 'casa'},
  ],
  summaries: [
    {student_id: 'r1', id: 's1', lesson_date: '2026-11-03', final: {}},
    {student_id: 'r1', id: 's2', lesson_date: '2026-11-12', final: {}},
  ],
};
test('Voor jou klaar: only published, not yet submitted homework; per relation, newest first', () => {
  const [r1, r2] = readyFor(DATA, Date.parse('2026-11-17T12:00:00Z'));
  assert.deepEqual(r1.homework, [{id: 'a1', title: 'Perfectum oefenen'}]);
  assert.deepEqual(r2.homework, [{id: 'a4', title: 'Ander vak'}], 'homework of another teacher stays with that relation');
});
test('Voor jou klaar: words due for review that can be shown as flashcards', () => {
  const [r1, r2] = readyFor(DATA, Date.parse('2026-11-17T12:00:00Z'));
  assert.equal(r1.dueWords, 1, 'not the one due next month, not the one without a meaning');
  assert.equal(r2.dueWords, 1);
});
test('Voor jou klaar: the latest approved lesson report; empty when there is nothing', () => {
  const [r1, r2] = readyFor(DATA, Date.parse('2026-11-17T12:00:00Z'));
  assert.equal(r1.latest.id, 's2'); assert.equal(r2.latest, null);
  const empty = readyFor({students: [{id: 'x'}], assignments: [], submissions: [], vocab: [], summaries: []})[0];
  assert.ok(!hasReady(empty));
});

test('wiring: dashboard section, student data via RLS only, compact report everywhere the student reads it', () => {
  const home = read('app/page.tsx');
  assert.match(home, /<ReadyForYou items=\{d\.loaded\?readyFor\(d\):null\} relations=\{studentLinks\.map/);
  assert.ok(home.indexOf('<ReadyForYou') < home.indexOf('className="statgrid"', home.indexOf('function StudentHome')), 'near the top of the student dashboard');
  // phase 5: no extra queries — the dashboard's own (RLS-limited) data is reused
  assert.match(home, /select\('id,student_id,title,published_at'\)/);
  assert.match(home, /select\('student_id,status,due_at,translation'\)/);
  assert.match(home, /rpc\('student_lesson_summaries',\{sid:id\}\)\.then/, 'reports via the existing approved-only function, tagged per relation');
  const r = read('components/ReadyForYou.tsx');
  assert.ok(!/supabase|\.from\(|\.rpc\(|authedPost|\/api\/ai/.test(r), 'the section itself queries nothing and calls no AI');
  assert.match(r, /\/oefenen\?student=\$\{rel\.id\}&spel=flashcards/);
  assert.match(read('components/Learning.tsx'), /if\(start==='flashcards'&&items&&items\.length>=2&&!autoStarted\.current\)/);
  assert.match(read('components/Analysis.tsx'), /<CompactAnalysis doc=\{shownDoc/, 'Mijn lessen → lesverslagen: compact, full version behind "Meer details"');
  assert.match(read('components/CompactAnalysis.tsx'), /<details className="compact-more"><summary>\{detailsLabel\|\|tt\("Meer details"\)\}/);
  assert.match(read('components/AnalysisV2.tsx'), /Zo ziet de leerling het/, 'teacher can preview the short version');
});
