// v48: panels follow in both directions; messages are not held back in a hidden tab; game state is requested while missing.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const html = read('public/legacy/index.html'), games = read('components/Games.tsx');
const fnSrc = name => { const i = html.indexOf('function ' + name + '('); let d = 0, j = html.indexOf('{', i); for (let k = j; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}' && --d === 0) return html.slice(i, k + 1); } };

test('shared panels: Canvas, Bord and Spelletjes, both roles, newest deliberate decision wins, no echo', () => {
  assert.match(html, /var SHARED = \["cv", "wb", "games"\], PSK = "klas-ps-" \+ \(isT \? "t" : "s"\) \+ "-" \+ \(ROOM \|\| "x"\);/, 'role in the key: two tabs in one browser do not mix');
  assert.match(html, /if\(why === "user"\) psDecide\(k, !!on\);/, 'every deliberate open/close is shared, by teacher AND student');
  assert.ok(!/isT && why !== "remote"\) send\(\{t:"gpanel"/.test(html), 'no longer teacher-only');
  assert.match(html, /case "panels": if\(window\.__psRemote\) window\.__psRemote\(m\.s\); break;/);
  assert.match(html, /setInterval\(function\(\)\{ if\(online\(\)\) psAll\(\); \}, 15000\);/, 'resent now and then: a lost message is corrected');
  assert.match(fnSrc('sendState'), /if\(window\.__cvShare\) window\.__cvShare\(\);/, 'teacher sends on (re)connect');
  assert.match(html, /store\("klas-open-" \+ \(isT \? "t" : "s"\)\)/, 'layout per role');
});
test('send queue: normal messages go out at once; no waiting on throttled timers in a hidden tab', () => {
  const p = fnSrc('pump');
  assert.match(p, /while\(queue\.length && online\(\)\)\{/);
  assert.match(p, /\(m\.t === "chunk" \|\| m\.t === "big"\) && queue\.length && !document\.hidden/);
  assert.ok(!/setTimeout\(pump, \(m\.t/.test(p));
});
test('games: student asks for the state while connected and shows whether it is connected', () => {
  assert.match(games, /function online\(\)\{try\{return !!\(frame\(\)\?\.contentWindow/);
  assert.match(games, /const id=setInterval\(ask,4000\)/);
  assert.match(games, /linked\?tt\('Je docent start zo een spel\.'\):tt\('Nog niet verbonden met je docent\. Het spel verschijnt zodra de verbinding er is\.'\)/);
});
