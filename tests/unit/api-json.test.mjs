// Regression: "Unexpected token '<', '<!DOCTYPE ...' is not valid JSON".
// Cause 1: the classroom (served at /legacy/index.html) called the relative path "api/ai" → /legacy/api/ai → 404 HTML page.
// Cause 2: pages/api/ai.js and pages/api/data.js used CommonJS module.exports, which Next.js 15 does not accept as the
// default export → every call answered with a 500 HTML error page. Both are fixed; responses that are not JSON now
// give a readable message instead of a parse error.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const html = read('public/legacy/index.html');

test('pages/api routes export a default handler (no CommonJS module.exports / require)', () => {
  for (const f of readdirSync(path.join(root, 'pages/api'))) {
    const s = read('pages/api/' + f);
    assert.match(s, /^export default async function handler\(req, res\) \{/m, f);
    assert.ok(!/module\.exports|require\(/.test(s.replace(/\/\/.*$/gm, '')), f + ': no CommonJS');
  }
});
test('classroom calls the API from the site root, never relative to /legacy/', () => {
  assert.match(html, /var url = path\.charAt\(0\) === "\/" \? path : "\/" \+ path;/);
  assert.match(html, /return fetch\(url, opts\); \};/);
  assert.match(html, /fetch\("\/api\/data\?ping=1"\)/);
  assert.ok(!/fetch\("api\//.test(html), 'no relative api fetch left');
});
test('a non-JSON answer (404/500 HTML, Vercel login page) becomes a readable message, not a JSON parse error', () => {
  const fn = html.slice(html.indexOf('function api(path, opts)'), html.indexOf('function cloudGet('));
  assert.match(fn, /return r\.text\(\)\.then\(function\(txt\)\{/);
  assert.match(fn, /try\{ j = txt \? JSON\.parse\(txt\) : \{\}; \}catch\(e\)\{ j = null; \}/);
  assert.ok(!/r\.json\(\)/.test(fn));
  const hw = read('app/huiswerk-client.tsx');
  assert.ok(!/await res\.json\(\);/.test(hw), 'homework fetches have a fallback');
});
test('every app client fetch that parses JSON has a fallback', () => {
  const files = [];
  const walk = d => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) { if (!/node_modules|[\\/]api$|[\\/]server$/.test(p)) walk(p); } else if (/\.tsx?$/.test(f)) files.push(p); } };
  for (const d of ['app', 'components', 'lib']) walk(path.join(root, d));
  for (const p of files) for (const line of readFileSync(p, 'utf8').split('\n'))
    if (/\.json\(\)/.test(line) && !/\.json\(\)\.catch/.test(line) && /fetch\(/.test(line)) assert.fail(path.relative(root, p) + ': ' + line.trim().slice(0, 120));
});
