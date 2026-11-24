// v64: NT2 curriculum from the PDF, homework plan (time → amount, level → kind, 40/30/20/10), complete blocks only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
import {NT2, NT2_STAGES} from '../../lib/curriculum/nt2.ts';
import {planBlocks, blocksFor, splitRoles, assignTopics, textLength, validBlock} from '../../lib/homework/plan.ts';

test('NT2 curriculum: every topic of the PDF in its order, stable unique ids, SQL generated from the same data', () => {
  const per = s => NT2.filter(t => t.stage === s).length;
  assert.deepEqual(NT2_STAGES.map(per), [17, 14, 14, 11, 6, 6]);
  assert.equal(new Set(NT2.map(t => t.code)).size, NT2.length);
  assert.equal(NT2.find(t => t.code === 'nt2-a2-01').title, 'Perfectum (voltooid tegenwoordige tijd)');
  assert.equal(NT2.find(t => t.code === 'nt2-b1-04').title, 'Er — alle functies');
  assert.ok(!NT2.some(t => t.level === 'C2'), 'nothing presented as C2 from the PDF');
  const sql = read('supabase/v64.sql');
  for (const t of NT2) assert.ok(sql.includes(`('${t.code}', 'nl',`), t.code);
  assert.ok(!/delete from|drop table|'pt'/i.test(sql.replace(/--.*$/gm, '')), 'non-destructive, Portuguese untouched');
});

test('time decides the amount: 5→1 block of ~5 questions … 45→8 blocks', () => {
  assert.deepEqual([5, 10, 15, 20, 30, 45].map(blocksFor), [1, 2, 3, 4, 6, 8]);
  const five = planBlocks(5, 'A1'); assert.equal(five.length, 1); assert.equal(five[0].count, 5);
  for (const [m, l] of [[10, 'A1'], [20, 'A2'], [30, 'B1'], [45, 'B2']]) assert.equal(planBlocks(m, l).reduce((n, b) => n + b.weight, 0), blocksFor(m), `${m} ${l}`);
});

test('level decides the kind: reading from A2 at 20+ min, writing at 15 min, none at A1; text lengths per level', () => {
  assert.ok(!planBlocks(30, 'A1').some(b => b.type === 'reading' || b.type === 'write'));
  assert.ok(planBlocks(20, 'A2').some(b => b.type === 'reading') && planBlocks(15, 'A2').some(b => b.type === 'write'));
  assert.deepEqual(textLength('A2', 20), [80, 150]); assert.deepEqual(textLength('B1', 30), [150, 250]); assert.deepEqual(textLength('B2', 30), [200, 350]);
  assert.ok(planBlocks(20, 'A2', 'vocab').every(b => b.role === 'vocab'), 'focus vocabulary');
});

test('40/30/20/10 split, varied topics, never invented grammar', () => {
  const r = splitRoles(10); const c = k => r.filter(x => x === k).length;
  assert.deepEqual([c('recent'), c('weak'), c('review'), c('vocab')], [4, 3, 2, 1]);
  const b = assignTopics(planBlocks(20, 'A1'), {recent: ['Perfectum', 'Bijzinnen'], weak: ['Inversie'], review: []});
  assert.ok(b.every(x => x.role === 'vocab' || ['Perfectum', 'Bijzinnen', 'Inversie'].includes(x.topic)));
  const none = assignTopics(planBlocks(10, 'A1'), {recent: [], weak: [], review: []});
  assert.ok(none.every(x => x.role === 'vocab' && !x.topic), 'no covered grammar → vocabulary, not new grammar');
});

test('incomplete AI blocks are rejected (then retried; nothing half is published)', () => {
  const ok = {passage: '', items: Array.from({length: 5}, (_, i) => ({type: 'fill_in', prompt: `Ik ___ naar huis ${i}`, options: [], answer: 'ga'}))};
  assert.ok(validBlock(ok, {count: 5, type: 'fill_in'}));
  assert.ok(!validBlock({...ok, items: ok.items.slice(0, 2)}, {count: 5, type: 'fill_in'}), 'too few items');
  assert.ok(!validBlock({...ok, items: [{type: 'multiple_choice', prompt: 'Kies', options: ['a', 'b'], answer: 'c'}]}, {count: 1, type: 'multiple_choice'}), 'answer not among options');
  assert.ok(!validBlock({passage: 'te kort', items: [{type: 'reading', prompt: 'Waarom?', options: [], answer: 'x'}]}, {count: 1, type: 'reading'}), 'reading text required');
  const r = read('app/api/ai/exercises/route.ts');
  assert.match(r, /for \(let attempt = 0; attempt < 3; attempt\+\+\)/); assert.match(r, /Er is niets gepubliceerd/);
  assert.ok(!/maxTokens: 8000/.test(r), 'no single huge call any more');
});

test('learning line: four statuses, NT2 for Dutch only, level separate from topic mastery', () => {
  const l = read('lib/learning.ts');
  assert.match(l, /GOAL_STATUSES: GoalStatus\[\] = \['not_started', 'in_progress', 'review', 'mastered'\]/);
  const p = read('components/LearningPath.tsx');
  assert.match(p, /subject==='nl'&&gl\.some\(x=>x\.code\?\.startsWith\('nt2-'\)\)/);
  assert.match(p, /ook een B1-leerling kan nog A1-grammatica oefenen/);
  assert.match(read('lib/server/analysisRunner.ts'), /subject === 'nl' && goals\.some\(t => t\.code\?\.startsWith\('nt2-'\)\)/);
});
