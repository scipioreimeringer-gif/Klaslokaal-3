// v38 phase 2: one navigation bar at the bottom of the classroom, and the teacher stays when a student leaves.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(path.join(root, 'public/legacy/index.html'), 'utf8');

test('one bottom navigation: Video, Canvas, Bord, Slides, Scherm, Spelletjes, Splitsen', () => {
  for (const lbl of ['Video', 'Canvas', 'Bord', 'Slides', 'Scherm', 'Spelletjes', 'Splitsen'])
    assert.match(html, new RegExp(`<span class="lbl">${lbl}</span>`), lbl);
  assert.match(html, /\[bVid, bCv, bWb, bSl, bSc, bGm, bSp\]/, 'in this order');
  assert.match(html, /id="mswitch"[^>]*hidden/, 'the old tab row at the top is hidden');
  assert.match(html, /#mswitch,body\.v28 #mswitch\{display:none!important\}/);
});
test('Spelletjes only where games exist; Splitsen not on a phone', () => {
  assert.match(html, /bGm\.hidden = !\(SB && b && b\.ui && b\.ui\.games\)/);
  assert.match(html, /@media \(max-width:700px\)\{\.dock \.navsplit\{display:none\}\}/);
});
test('Scherm is a toggle and never asks a student to share; without a lesson no empty screen view', () => {
  const fn = html.slice(html.indexOf('bSc.addEventListener("click"'), html.indexOf('bTl.addEventListener'));
  assert.match(fn, /if\(mview === "scr"\)\{ if\(screenStream\) stopShare\(\); else window\.__klasTab\(window\.__klasPrevTab/);
  assert.match(fn, /if\(isT && peer\) startShare\(\)/, 'only the teacher with a running lesson starts sharing');
  assert.match(fn, /Je docent deelt nu geen scherm/);
});
test('closing the split keeps the side that was used last', () => {
  assert.match(html, /function openWork\(m\)\{[^\n]*window\.__klasPrevWork = "wb"/);
  assert.match(html, /bSl\.addEventListener\("click", function\(\)\{[^\n]*window\.__klasPrevWork = "sl"/);
  assert.match(html, /bSp\.addEventListener\("click", function\(\)\{ window\.__klasTab\(mview === "both" \? \(window\.__klasPrevWork \|\| "wb"\) : "both"/);
});
test('a "new" dot appears on the bottom navigation, not on the hidden tab row', () => {
  assert.match(html, /if\(window\.__klasMarkNew\) window\.__klasMarkNew\(which\)/);
  assert.match(html, /\.dock \.navtab\.new:after/);
});

test('student leaves → teacher stays; only that student is cleaned up', () => {
  const fn = html.slice(html.indexOf('function dropStudent('), html.indexOf('function sayBye('));
  assert.ok(fn.length > 50, 'dropStudent exists');
  assert.match(fn, /if\(!isT \|\| !id\) return;/);
  assert.match(fn, /delete conns\[id\]; delete calls\[id\]; delete scrCalls\[id\]; delete remoteStreams\[id\];/);
  assert.match(fn, /removeRemote\(id\)/, 'frozen picture removed');
  assert.ok(!/peer\.destroy|leave\(\)/.test(fn), 'the teacher\'s own peer is NOT destroyed');
  assert.match(fn, /recStop\(\)/, 'recording stops when nobody is left');
});
test('teacher cleans up on bye, on a closed data connection and on a lost call', () => {
  assert.match(html, /if\(d && d\.t === "bye"\)\{ dropStudent\(conn\.peer, true\); return; \}/);
  assert.match(html, /conn\.on\("close", function\(\)\{ dropStudent\(conn\.peer, false\); \}\)/);
  assert.match(html, /if\(st === "closed"\) dropStudent\(id, false\)/);
  assert.match(html, /dropStudent\(id, false\); \}, 12000\)/, 'interrupted for 12 s → cleaned up');
});
test('leaving says bye first (button and closing the tab); the student hears when the teacher leaves', () => {
  assert.match(html, /function leave\(\)\{[\s\S]{0,120}sayBye\(\);/);
  assert.match(html, /window\.addEventListener\("pagehide", function\(\)\{ if\(peer\) sayBye\(\); \}\)/);
  assert.match(html, /case "bye": if\(!isT\)\{ removeRemote\("docent"\)/);
});
test('a student sees the right start hint', () => {
  assert.match(html, /else if\(!isT\) status\(undefined, 'Klik bovenaan op "Naar de les"\.'\);/);
});
