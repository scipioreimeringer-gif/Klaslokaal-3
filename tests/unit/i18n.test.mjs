// Interface translations: completeness, placeholders, no hard-coded JSX text, classroom dictionary.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {collectKeys, root} from './i18n-keys.mjs';
import {M} from '../../lib/i18n/messages.ts';
import {t, setCurrentLang, translated, LANGS} from '../../lib/i18n.ts';

const ph = s => (s.match(/\{\d+\}/g) || []).sort().join();
const keys = collectKeys();

test('every interface key used in the code has all 5 translations', () => {
  const missing = [...keys.keys()].filter(k => !M[k] || M[k].length !== 5 || M[k].some(x => typeof x !== 'string' || !x.length));
  assert.deepEqual(missing.map(k => `${k}  (${keys.get(k)})`), []);
});

test('placeholders and leading/trailing spaces are kept in every translation', () => {
  const bad = [];
  for (const [k, row] of Object.entries(M)) row.forEach((x, i) => {
    if (ph(x) !== ph(k)) bad.push(`${k} [${i}] placeholders`);
    if (/^\s/.test(k) !== /^\s/.test(x) || /\s$/.test(k) !== /\s$/.test(x)) bad.push(`${k} [${i}] spaces`);
  });
  assert.deepEqual(bad, []);
});

test('t(): language switch, placeholders, unknown text passes through, label tables translate on read', () => {
  setCurrentLang('en');
  assert.equal(t('Opslaan'), 'Save');
  assert.equal(t('{0} van {1} gedaan', 3, 5), '3 of 5 done');
  assert.equal(t('Tekst die niet bestaat'), 'Tekst die niet bestaat');
  const table = translated({a: 'Beheerst'});
  assert.equal(table.a, 'Mastered');
  setCurrentLang('pt'); assert.equal(table.a, 'Dominado');
  setCurrentLang('de'); assert.equal(t('Opslaan'), 'Speichern');
  setCurrentLang('nl'); assert.equal(t('Opslaan'), 'Opslaan');
  assert.deepEqual([...LANGS], ['nl', 'en', 'pt', 'es', 'fr', 'de']);
});

test('no hard-coded visible text in JSX (everything goes through t())', () => {
  const ts = createRequire(path.join(root, 'package.json'))('typescript');
  const files = [];
  const walk = (d, rec) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) { if (rec && !/node_modules|\.next|[\\/]api$/.test(p)) walk(p, rec); } else if (f.endsWith('.tsx')) files.push(p); } };
  walk(path.join(root, 'app'), true); walk(path.join(root, 'components'), false);
  const found = [];
  for (const file of files) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    (function visit(n) {
      if (ts.isJsxText(n)) { const x = n.getText().trim(); if (/[A-Za-zÀ-ÿ]{2,}/.test(x)) found.push(`${path.relative(root, file)}: ${x.slice(0, 60)}`); }
      if (ts.isJsxAttribute(n) && /^(title|placeholder|aria-label|alt)$/.test(n.name.getText()) && n.initializer && ts.isStringLiteral(n.initializer) && /[A-Za-zÀ-ÿ]{3,}/.test(n.initializer.text)) found.push(`${path.relative(root, file)}: ${n.name.getText()}="${n.initializer.text}"`);
      ts.forEachChild(n, visit);
    })(sf);
  }
  assert.deepEqual(found, []);
});

test('pages that translate are client components (the language choice lives in the browser)', () => {
  const server = [];
  const walk = d => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) { if (!/[\\/]api$/.test(p)) walk(p); } else if (/^(page|layout)\.tsx$/.test(f) || f.endsWith('-client.tsx')) { const s = readFileSync(p, 'utf8'); if (/lib\/i18n'/.test(s) && !/^\s*['"]use client['"]/.test(s)) server.push(path.relative(root, p)); } } };
  walk(path.join(root, 'app'));
  assert.deepEqual(server, []);
});

test('classroom dictionary: valid script, 5 translations per text, placeholders kept', () => {
  const ctx = {window: {}};
  vm.runInNewContext(readFileSync(path.join(root, 'public/legacy/i18n.js'), 'utf8'), ctx);
  const D = ctx.window.KLAS_I18N;
  assert.ok(Object.keys(D).length > 300);
  const bad = Object.entries(D).filter(([k, r]) => !Array.isArray(r) || r.length !== 5 || r.some(x => !x) || r.some(x => ph(x) !== ph(k))).map(([k]) => k);
  assert.deepEqual(bad, []);
  // the classroom loads it
  assert.match(readFileSync(path.join(root, 'public/legacy/index.html'), 'utf8'), /<script src="\/legacy\/i18n\.js"><\/script>/);
});
