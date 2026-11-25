// v40 phase 7: four toggles in the classroom bottom bar, combinations, calmer top bar. WebRTC/TURN untouched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(path.join(root, 'public/legacy/index.html'), 'utf8');
const mod = html.slice(html.indexOf('v40: FOUR TOGGLES AND A CALMER TOP BAR'));

test('bottom bar middle: exactly Canvas | Bord │ Scherm | Spelletjes; old Video, Slides and Splitsen buttons removed', () => {
  assert.match(mod, /mid\.querySelectorAll\("\.navtab,\.navsplit,\.vsep"\)\.forEach\(function\(x\)\{ x\.remove\(\); \}\)/);
  const made = [...mod.matchAll(/mk\("(\w+)",/g)].map(m => m[1]);
  assert.deepEqual(made, ['cv', 'wb', 'scr', 'games']);
  assert.match(mod, /sepEl\.className = "vsep v40sep"/, 'separator between Bord and Scherm');
  assert.match(mod, /\[tl, undo\]\.forEach/, 'board tools and undo moved to the board panel');
});
test('every button is a toggle; opening one never closes another; closing deletes nothing', () => {
  assert.match(mod, /setOpen\(k, full \? true : !OPEN\[k\], "user"\)/, 'v42: a click while the video is full only opens');
  assert.match(mod, /window\.__klasTab = function\(t, why\)\{ \/\* compatible API|window\.__klasTab = function\(t, why\)\{/);
  const tab = mod.slice(mod.indexOf('window.__klasTab = function'), mod.indexOf('setMode = function'));
  assert.ok(!/, false/.test(tab), '__klasTab only opens');
  assert.ok(!/innerHTML = ""|\.remove\(\)|clear\(/.test(mod.slice(mod.indexOf('function setOpen'), mod.indexOf('window.__klasToggle'))), 'closing only hides');
});
test('Canvas and Bord separately or together (canvas is its own panel: same editor element, moved)', () => {
  assert.match(mod, /pCv\.id = "pCv"/);
  assert.match(mod, /cvHead\.appendChild\(cvBar\)/);
  assert.match(mod, /pCv\.appendChild\(cvBody\)/);
  assert.match(mod, /var ORDER = \["cv", "wb", "scr", "games"\]/);
  assert.match(mod, /var two = vis\.length === 2 && !stackIt;/, 'two panels use the existing splitter');
  assert.match(mod, /ws\.style\.gridTemplateColumns = \(leftFr \* 100\) \+ "% 8px 1fr"/);
});
test('screen: hiding the panel is not stopping the stream; explicit start/stop in the ⋯ menu', () => {
  // v69: stopping is an explicit choice via the separate Delen button (no confirm dialog when hiding the panel)
  assert.ok(!/confirm\("Scherm delen stoppen\?/.test(mod));
  assert.match(mod, /setOpen\("scr", false\); if\(screenStream\) toast\(/, 'otherwise only the panel is hidden');
  assert.match(mod, /if\(screenStream\) stopShare\(\); else if\(peer\)\{ setOpen\("scr", true, "user"\); startShare\(\); \}/);
});
test('sync kept: the teacher opening Canvas/Bord still reaches the student (opens there, closes nothing)', () => {
  assert.match(mod, /if\(remote\)\{ if\(!OPEN\[k\]\)\{ OPEN\[k\] = true; save\(\); layout\(\); \} return; \}/);
  assert.match(mod, /if\(isT\) send\(\{t:"mode", m:k\}\)/);
  assert.match(read('app/klaslokaal/live/page.tsx'), /frameCall\('__klasToggle','games',false\)/, 'closing games in the app hides the games panel');
});
test('top bar: timer next to the lesson name, connection as a dot (tooltip keeps TURN), one ⋯ menu, one leave button', () => {
  assert.match(mod, /tbl\.appendChild\(\$\("timer"\)\)/);
  assert.match(mod, /\$\("conn"\)\.classList\.add\("conn-dot"\)/);
  assert.match(html, /c\.title = "Lescode: " \+ \(ROOM \|\| "-"\) \+ " · TURN: " \+ turnText\(\)/, 'TURN diagnostics unchanged');
  assert.match(mod, /tbr\.insertBefore\(leave, gear\)/);
  assert.match(mod, /if\(gear\.contains\(x\)\) return;/, 'settings, private notes and dashboard go into one menu');
});
test('WebRTC / TURN / camera code is not touched by the v40 module', () => {
  assert.ok(!/new Peer\(|getUserMedia|iceServers|RTCPeerConnection|loadTurn\(/.test(mod));
});
function read(f) { return readFileSync(path.join(root, f), 'utf8'); }
