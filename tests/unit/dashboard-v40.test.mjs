// v40 phase 5+6: "Voor jou klaar" card grid and the compact workspace navigation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readyFor} from '../../lib/ready.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');

test('homework progress per relation (published vs handed in), other relations never mixed in', () => {
  const [r1, r2] = readyFor({students: [{id: 'r1'}, {id: 'r2'}],
    assignments: [{id: 'a1', student_id: 'r1', title: 'A', published_at: '2026-11-10'}, {id: 'a2', student_id: 'r1', title: 'B', published_at: '2026-11-11'}, {id: 'a3', student_id: 'r1', title: 'C', published_at: null}, {id: 'a4', student_id: 'r2', title: 'D', published_at: '2026-11-11'}],
    submissions: [{assignment_id: 'a1'}], vocab: [], summaries: []});
  assert.equal(r1.homeworkPublished, 2); assert.equal(r1.homeworkDone, 1); assert.equal(r1.homework.length, 1);
  assert.equal(r2.homeworkPublished, 1); assert.equal(r2.homeworkDone, 0);
});
test('cards: Huiswerk, Flashcards, Laatste les, Oefenen — short labels, progress bar, grouped per language + teacher', () => {
  const r = read('components/ReadyForYou.tsx');
  for (const k of ['title={tt("Huiswerk")}', 'title={tt("Flashcards")}', 'title={tt("Laatste les")}', 'title={tt("Oefenen")}']) assert.ok(r.includes(k), k);
  assert.match(r, /tt\("\{0\} woorden herhalen",r\.dueWords\)/);
  assert.match(r, /tt\("Gemengde oefening"\)\+\(rel\.level\?` · \$\{rel\.level\}`:''\)/);
  assert.match(r, /role="progressbar"/);
  assert.match(r, /\{rel\.lang&&<Flag code=\{rel\.lang\} size=\{16\}\/>\}\{rel\.lang\?languageName\(rel\.lang\):rel\.label\}/);
  assert.ok(!/supabase|\.from\(|\.rpc\(/.test(r), 'no extra queries');
  const css = read('app/style.css');
  assert.match(css, /\.rgrid\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:1000px\)\{\.rgrid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\}/);
});
test('navigation: Home, Lessen, AI-verslag, Woorden, Leerpad, Taken, Oefenen, Bord, Opnames (+ Privé for the teacher), same routes', () => {
  const ws = read('components/StudentData.tsx');
  for (const [k, l] of [['overzicht', 'Home'], ['lessen', 'Lessen'], ['analyses', 'AI-verslag'], ['woorden', 'Woorden'], ['doelen', 'Leerpad'], ['huiswerk', 'Taken'], ['oefenen', 'Oefenen'], ['bord', 'Bord'], ['opnames', 'Opnames'], ['prive', 'Privé']])
    assert.ok(ws.includes(`['${k}','${l}'`), l);
  assert.match(ws, /data-secondary=\{primary\?undefined:''\}/);
  assert.match(ws, /aria-haspopup="menu"/);
  const css = read('app/style.css');
  assert.match(css, /\.compact-ws \.tabs button\{[^}]*min-height:34px/);
  assert.match(css, /@media\(max-width:640px\)\{\s*\.compact-ws \.tabs\{overflow:visible\}\s*\.compact-ws \.tabs>button\[data-secondary\]\{display:none\}/);
});
