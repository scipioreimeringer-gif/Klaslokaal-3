// v66: lesson duration picker, classroom timer linked to the planned lesson, homework quality (focus options,
// templates per topic, programmatic + AI validation, regenerate one block, teacher editor).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
import {templateFor, itemProblem} from '../../lib/homework/templates.ts';
import {planBlocks, assignTopics, applyTemplates, cleanItems, blocksFor} from '../../lib/homework/plan.ts';

test('duration: 30/60/90 or own minutes, end time shown, used for lessons and bookings', () => {
  const a = read('components/Agenda.tsx');
  assert.match(a, /const DURATIONS=\[30,60,90\]/);
  assert.match(a, /export function DurationPicker/);
  assert.ok((a.match(/<DurationPicker /g) || []).length >= 2, 'lesson form and booking form');
  assert.match(a, /t\('Zelf bepalen'\)/); assert.match(a, /t\('tot \{0\}'/);
  assert.match(a, /joint_seconds/, 'planned / together / recording kept separately');
});

test('timer: countdown before the planned start, time since the planned start, overrun, same source for both roles', () => {
  const h = read('public/legacy/index.html'), live = read('app/klaslokaal/live/page.tsx');
  assert.match(h, /T\("Les begint over"\)/);
  assert.match(h, /lessonEndsAt/);
  assert.match(live, /lessonStartsAt/); assert.match(live, /lessonEndsAt/);
  assert.match(read('public/legacy/i18n.js'), /"Les begint over":\[/);
});

test('templates: the topic decides a proven exercise form; unknown topics get the generic one', () => {
  assert.equal(templateFor('Perfectum met hebben en zijn').id, 'perfect');
  assert.equal(templateFor('Bijzinnen met omdat').type, 'make_sentence');
  assert.equal(templateFor('De/het-woorden').id, 'articles');
  assert.equal(templateFor('Pretérito perfeito').id, 'generic');
  const b = applyTemplates(assignTopics(planBlocks(10, 'A2', 'choose'), {recent: [], weak: [], review: [], topics: ['Perfectum', 'Bijzinnen']}));
  assert.deepEqual(b.map(x => x.type), ['conjugate', 'make_sentence']);
  assert.ok(b[1].open && b[1].count === 4);
});

test('forbidden: answer in brackets, answer already visible, no gap, ambiguous multiple choice, duplicates', () => {
  const F = (prompt, answer, extra = {}) => ({type: 'fill_in', prompt, options: [], answer, ...extra});
  assert.equal(itemProblem(F('Gisteren ___ ik naar de markt. (ben gegaan)', 'ben gegaan')), 'antwoord staat tussen haakjes');
  assert.equal(itemProblem(F('Gisteren ___ ik naar de markt (gaan).', 'ben gegaan', {type: 'conjugate'})), '', 'infinitive in brackets is allowed');
  assert.equal(itemProblem(F('Ik woon in Utrecht.', 'woon')), 'geen invulplek');
  assert.equal(itemProblem(F('Ik woon in ___, Utrecht is mooi.', 'Utrecht')), 'antwoord staat al in de zin');
  const mc = (options, answer) => ({type: 'multiple_choice', prompt: 'Kies het juiste woord', options, answer});
  assert.equal(itemProblem(mc(['de', 'het', 'de'], 'het')), 'dubbele opties');
  assert.equal(itemProblem(mc(['de', 'het'], 'een')), 'antwoord niet precies één keer tussen de opties');
  assert.equal(itemProblem(mc(['de', 'het'], 'het')), '');
  const c = cleanItems([F('Ik ___ thuis.', 'ben'), F('ik ___ thuis.', 'ben'), F('Hij ___ (zijn) moe.', 'is')]);
  assert.equal(c.kept.length, 2); assert.equal(c.dropped[0].why, 'dubbel');
});

test('focus: five options; mix spreads all roles; developing uses topics in progress; ~5 questions per 5 minutes', () => {
  assert.deepEqual(planBlocks(20, 'A1', 'mix').map(b => b.role), ['recent', 'review', 'weak', 'vocab']);
  assert.ok(planBlocks(15, 'A1', 'developing').every(b => b.role === 'weak'));
  assert.equal(planBlocks(5, 'A1').reduce((n, b) => n + b.count, 0), 5); assert.equal(blocksFor(30), 6);
  const r = read('app/api/ai/exercises/route.ts');
  assert.match(r, /if \(focus === 'developing'\) lists\.weak = /);
  assert.match(r, /\(focus === 'topics' \|\| focus === 'choose'\) && topicReq/);
  assert.match(r, /Teacher's extra wish/);
  assert.match(r, /From the lesson canvas \(context only\)/); assert.match(r, /Teacher feedback on earlier homework/);
  const l = read('components/Learning.tsx');
  for (const k of ['Automatisch gepersonaliseerd', 'Laatste les herhalen', 'Mix van alles', 'Onderwerpen in ontwikkeling', 'Zelf onderwerpen kiezen']) assert.ok(l.includes(k), k);
  assert.match(l, /from\('student_goal_progress'\)\.select\('status,curriculum_goals\(title\)'\)/, 'topics from the personal learning line');
});

test('pipeline: programmatic checks, one batched AI review, only rejected blocks regenerated; one block on request', () => {
  const r = read('app/api/ai/exercises/route.ts');
  assert.match(r, /const c = cleanItems\(r\.items, b\.open\)/);
  assert.match(r, /const rv = await askFast\(Review,/);
  assert.match(r, /const again = await runAll\(redo\.map\(k => blocks\[k\]\)/);
  assert.match(r, /if \(one\) return Response\.json\(\{section: sections\[0\], items, spec: blocks\[0\]\}\)/);
  assert.match(r, /Exercise template: \$\{tpl\.how\}/);
});

test('teacher editor: edit, add, delete questions; delete or regenerate one block, the rest stays', async () => {
  const src = read('components/HomeworkDraft.tsx');
  assert.match(src, /action: 'block', block: spec/);
  assert.match(read('app/huiswerk-client.tsx'), /<HomeworkDraft set=\{aiSet\} studentId=\{studentId\} onChange=\{setAiSet\}\/>/);
  // the pure helpers (taken from the component file; no React needed)
  const body = src.slice(src.indexOf('export function dropBlock'), src.indexOf('export function HomeworkDraft')).replace(/export /g, '').replace(/: ExerciseSet|: ExerciseSection|: ExerciseItem\[\]|: number/g, '').replace(/\(it, j\)/g, '(it, j)');
  const {dropBlock, replaceBlock} = new Function(body + '; return {dropBlock, replaceBlock};')();
  const I = (b, p) => ({type: 'fill_in', prompt: p, block: b});
  const set = {title: 'x', items: [I(0, 'a'), I(0, 'b'), I(1, 'c'), I(2, 'd')], sections: [{title: 'A'}, {title: 'B'}, {title: 'C'}], plan: [{i: 0}, {i: 1}, {i: 2}]};
  const d = dropBlock(set, 1);
  assert.deepEqual(d.items.map(x => [x.block, x.prompt]), [[0, 'a'], [0, 'b'], [1, 'd']]); assert.deepEqual(d.sections.map(s => s.title), ['A', 'C']);
  const n = replaceBlock(set, 1, {title: 'B2'}, [I(9, 'c1'), I(9, 'c2')]);
  assert.deepEqual(n.items.map(x => [x.block, x.prompt]), [[0, 'a'], [0, 'b'], [1, 'c1'], [1, 'c2'], [2, 'd']]);
  assert.equal(n.sections[1].title, 'B2'); assert.equal(n.sections[0].title, 'A');
});
