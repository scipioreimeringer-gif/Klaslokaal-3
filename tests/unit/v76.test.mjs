// v76: the daily learning route — one central session of existing games, exact resume, shared by Overzicht and Oefenen.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {planRoute, routeProgress, roundXp, routeXpMax, ROUTE_DEFAULT} from '../../lib/route.ts';
import {xpOf} from '../../lib/motivation.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const items = n => Array.from({length: n}, (_, i) => ({key: 'k' + i}));

test('default route: daily challenge 10 · flashcards 5 · conjugate 5 · match 5 · sentence 3 · errors 3', () => {
  const r = planRoute('2026-11-27', {flashcards: items(5), conjugate: items(10), match: items(6), sentence: items(10), errors: items(8), typing: items(4), quiz: items(6)}, {level: 'A2'});
  assert.deepEqual(r.rounds.map(x => [x.kind, x.n]), ROUTE_DEFAULT);
  assert.equal(r.rounds[0].items, null, 'round 1 = the personal daily challenge (own frozen set)');
  assert.ok(r.rounds.slice(1).every(x => Array.isArray(x.items) && x.items.length === x.n), 'frozen decks are stored with the route');
});

test('no forced games: too few reliable items → an alternative round, otherwise skipped; mixed practice has no daily round', () => {
  const r = planRoute('2026-11-27', {flashcards: items(5), conjugate: [], match: items(2), sentence: items(1), errors: items(3), typing: items(4), quiz: items(6)}, {level: 'B1'});
  const kinds = r.rounds.map(x => x.kind);
  assert.ok(!kinds.includes('conjugate') && !kinds.includes('match') && !kinds.includes('sentence'));
  assert.ok(kinds.includes('typing') && kinds.includes('quiz'), 'replaced by the translation game and the quiz');
  assert.equal(new Set(kinds).size, kinds.length, 'every game at most once: varied');
  const m = planRoute('2026-11-27', {flashcards: items(5), conjugate: items(5), sentence: items(3), errors: items(3), typing: items(4), quiz: items(6)}, {mixed: true});
  assert.ok(!m.rounds.some(x => x.kind === 'daily'), 'mixed practice never claims the daily reward');
  assert.ok(m.rounds.some(x => x.kind !== 'quiz'), 'not only multiple choice');
});

test('progress and XP: shown per round with the same rules as the derived XP (no double award)', () => {
  const r = planRoute('2026-11-27', {flashcards: items(5), conjugate: items(5), match: items(5), sentence: items(3), errors: items(3)}, {level: 'A2'});
  assert.equal(routeProgress(r).pct, 0);
  const mid = {...r, cur: 2, pos: 2, res: [{score: 8, total: 10, xp: 20}, {score: 4, total: 5, xp: 10}]};
  assert.deepEqual(routeProgress(mid), {pct: Math.round((2 + 2 / 5) / 6 * 100), roundsDone: 2, total: 6, xp: 30});
  assert.equal(roundXp('daily', 10, false), 0, 'the daily reward only once per day'); assert.equal(roundXp('sentence', 3, false), 10);
  assert.equal(routeXpMax(r), 70);
  // the route's short rounds count in the derived XP (min 3 answers), still capped per day
  const p = [{created_at: '2026-11-27T10:00:00Z', total: 3, kind: 'sentence'}, {created_at: '2026-11-27T10:05:00Z', total: 3, kind: 'errors'}];
  assert.equal(xpOf({practice: p, homeworkDone: 0, lessons: 0, goal: 7}).games, 20);
});

test('one central session: shared card, exact resume inside a round, existing games only', () => {
  const dr = read('components/DailyRoute.tsx');
  assert.match(dr, /from\('daily_runs'\)\.select\('route'\)/); assert.match(dr, /update\(\{route:next/);
  assert.match(dr, /const items=\(rd\.items\|\|\[\]\)\.slice\(from\)/, 'continue exactly at the stored position');
  assert.match(dr, /onStep:ok=>step\(ok,rd\.kind\)/);
  for (const g of ['<Flashcards', '<Typing', '<Quiz', '<Match', '<TypeGame', '<DailyPlayer']) assert.ok(dr.includes(g), 'existing component ' + g);
  assert.ok(!/askFast|\/api\/ai/.test(dr), 'resuming never generates again');
  const learning = read('components/Learning.tsx');
  assert.match(learning, /ctx\.onStep\?\.\(ok\);/); assert.match(learning, /export function useGameSets\(/);
  assert.match(read('components/StudentDash.tsx'), /<RouteCard studentId=\{studentId\}/);
  assert.match(read('app/oefenen/page.tsx'), /<RouteCard key=\{rel\.id\} studentId=\{rel\.id\}/);
  assert.match(read('app/oefenen/dagelijks/page.tsx'), /mode=\{mix\?'mixed':'daily'\}/);
  const sql = read('supabase/v76.sql'); assert.match(sql, /add column if not exists route jsonb/);
  assert.ok(!/\b(drop|delete|truncate)\b/i.test(sql.replace(/--.*$/gm, '')));
  const agenda = read('components/Agenda.tsx');
  assert.match(agenda, /if\(compact\)return <section className="panel next-lesson compact nl2"/);
});
