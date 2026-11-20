// v49: an expired login token is renewed (and the request retried once) instead of "Ongeldige sessie".
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');

test('authFetch: fresh token before the request, one renewal + retry on 401, no loop', () => {
  const a = read('lib/authFetch.ts');
  assert.match(a, /s\.expires_at \* 1000 - Date\.now\(\) > 60_000/);
  assert.match(a, /await db\.auth\.refreshSession\(\)/);
  assert.match(a, /if \(r\.status !== 401\) return r;\n  const again = await freshToken\(db, true\);/);
  assert.equal((a.match(/await go\(/g) || []).length, 1, 'exactly one first try; the retry happens once');
});
test('every token-carrying call uses it (app, classroom bridge, classroom page)', () => {
  for (const f of ['lib/learning.ts', 'lib/classroomBridge.ts', 'components/GoogleCalendar.tsx', 'app/huiswerk-client.tsx']) {
    const s = read(f);
    assert.ok(!/session\?\.access_token/.test(s), f + ': no stale token read directly');
    assert.match(s, /authFetch|freshToken/, f);
  }
  assert.match(read('lib/classroomBridge.ts'), /async token\(force\?: boolean\) \{ return freshToken\(db, !!force\); \}/);
  assert.match(read('public/legacy/index.html'), /if\(r\.status === 401 && SB\) return bridge\(\)\.token\(true\)\.then\(function\(t\)\{ return t \? go\(t\) : r; \}/);
});
