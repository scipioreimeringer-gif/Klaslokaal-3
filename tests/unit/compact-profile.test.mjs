// v39: compact student profile (teacher) and workspace — functions kept, layout denser.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const page = read('app/leerlingen/page.tsx'), ws = read('components/StudentData.tsx'), css = read('app/style.css');

test('language section is one compact row; the long permanent texts are gone (tooltip instead)', () => {
  assert.match(page, /function LanguageBar\(/);
  assert.ok(!/function LanguageSettings\(/.test(page), 'old big card removed');
  assert.ok(!/<p className="muted small">\{t\('Een extra taal krijgt eigen lesgegevens/.test(page), 'no permanent long explanation');
  assert.ok(!/<p className="notice">\{t\('De taal is nog niet vastgezet/.test(page), 'no big yellow warning when the language is not set');
  assert.match(page, /className="lb-hint"[^>]*>\{t\('Kies een lestaal'\)\}/, 'small subtle hint instead');
  assert.match(page, /title=\{t\('Elke taal heeft eigen lesgegevens\./);
  assert.match(css, /\.langbar\{[^}]*min-height:44px/);
});
test('language logic kept: change (with confirm), add (own data via teacher_add_language), switch between languages', () => {
  assert.match(page, /from\('students'\)\.update\(\{curriculum_subject:v/);
  assert.match(page, /confirm\(t\('De taal van deze leerling wijzigen naar \{0\}\?/);
  assert.match(page, /rpc\('teacher_add_language',\{p_source:s\.id,p_language:add\}\)/);
  assert.match(page, /siblings=\{items\.filter\(x=>x\.id!==current\.id&&!x\.archived_at&&x\.email\.toLowerCase\(\)===current\.email\.toLowerCase\(\)\)\}/, 'other languages of the same student as chips');
  assert.match(page, /onClick=\{\(\)=>onOpen\(x\.id\)\}/, 'chip opens that language (its own record and data)');
  assert.match(page, /LANGUAGES\.filter\(l=>!taken\.has\(l\.code\)\)/, 'cannot add a language twice');
});
test('compact header: name, level, link status, quick start button; every action kept', () => {
  assert.match(page, /<header className="student-head">/);
  assert.match(page, /\/klaslokaal\/live\?student=/);
  assert.match(page, /\/lesruimte\?student=/);
  assert.match(page, /void invite\(\)/);
  for (const fn of ['setArchived(current,!current.archived_at)', 'unlink(current)', 'hardDelete(current)']) assert.ok(page.includes(fn), fn);
  assert.match(page, /<details className="card danger-zone">/, 'rarely used actions folded away');
});
test('key facts above the tabs: 4 small stat cards + focus points from the latest approved analysis', () => {
  assert.match(ws, /export function FactsBar\(/);
  assert.match(ws, /\{b&&<FactsBar p=\{b\.progress\} focus=\{focus\}\/>\}\s*<div className="tabs"/);
  assert.match(ws, /compactAnalysis\(b\.latestAnalysis\.final/);
  assert.match(read('lib/data.ts'), /async function latestSummary[\s\S]{0,400}catch \(e\) \{ return \{data: null, error: e\}; \}/, 'never breaks the profile');
  assert.match(css, /\.facts-grid\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:1000px\)\{\.facts-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\}/);
});
test('all tabs kept; compact tab bar scrolls horizontally on small screens', () => {
  for (const k of ['overzicht', 'lessen', 'analyses', 'woorden', 'doelen', 'huiswerk', 'oefenen', 'bord', 'opnames', 'prive']) assert.ok(ws.includes(`'${k}'`), k);
  assert.match(css, /\.compact-ws \.tabs\{[^}]*flex-wrap:nowrap;overflow-x:auto/);
});
test('long explanations behind an info icon that also works on touch and keyboard', () => {
  const tip = read('components/InfoTip.tsx');
  assert.match(tip, /aria-expanded=\{open\}/); assert.match(tip, /onClick=\{\(\)=>setOpen\(o=>!o\)\}/);
  assert.match(read('components/Learning.tsx'), /<InfoTip text=\{tt\("Moeilijke woorden komen vaker terug/);
  assert.match(read('components/LearningPath.tsx'), /<InfoTip text=\{tt\("Standaardleerlijn op basis van het ERK/);
});
