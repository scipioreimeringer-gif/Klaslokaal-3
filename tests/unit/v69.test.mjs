// v69: automatic classroom layout, three camera buttons, one-click screen sharing, bigger games, slide toolbar.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const html = read('public/legacy/index.html');
const v69 = html.slice(html.indexOf('v69: AUTOMATIC CLASSROOM LAYOUT'));

test('one central rule: nothing open → big cameras side by side; material open → right, stacked', () => {
  assert.match(v69, /return !!\(o\.cv \|\| o\.wb \|\| o\.scr \|\| o\.games\);/, 'based on what is open now');
  assert.match(v69, /return active\(\) \? "right" : "full";/);
  assert.match(v69, /window\.__camWork = autoCam; window\.__camAutoFull = autoCam; window\.__camToggleFull = autoCam;/, 'older entry points use the same rule');
  assert.match(v69, /var _layout = layout; layout = function\(\)\{ _layout\(\); autoCam\(\); \};/);
  assert.match(v69, /if\(m === "hidden"\) return;/, 'a closed camera panel stays closed');
  assert.match(html, /window\.__camSetMode = setMode; window\.__camMode = function\(\)\{ return mode; \};/);
  assert.match(html, /OPEN\.cv = psFresh\(PS\.cv\) \? !!PS\.cv\.open : false;/, 'a lesson opens with the big cameras');
  // the auto view of the camera tiles already puts them side by side in a wide box and stacked in a tall one (v53)
  assert.match(html, /return r && r\.width > r\.height \* 1\.15 \? "side" : "stack";/);
});

test('camera bar: settings, own picture, close; closing never touches call or recording', () => {
  assert.match(v69, /#camPin,body\.v69 #camFull,body\.v69 #vSize,body\.v69 #vMin,body\.v69 #pipBtn\{display:none!important\}/);
  // own picture: only the local preview element is hidden; the outgoing tracks are untouched
  assert.match(html, /selfView = !selfView; store\("klas-self-" \+ \(isT \? "t" : "s"\), selfView\);[\s\S]{0,120}\$\("selfV"\)\.hidden = !selfView \|\| !local;/);
  assert.match(v69, /window\.__camShow = function\(v\)\{ if\(window\.__camSetMode\)\{ window\.__camSetMode\(v \? want\(\) : "hidden", "v69"\)/);
  assert.ok(!/getTracks\(\)\.forEach\(function\(t\)\{ t\.stop\(\)/.test(v69.replace(/screen sharing[\s\S]*?slides toolbar/, '')), 'no track is stopped by the layout');
  assert.ok(!/peer\.(call|destroy)|new Peer\(|getUserMedia/.test(v69), 'WebRTC untouched');
});

test('screen sharing: one click opens the native picker, no extra dialog; stop resets and restores the layout', () => {
  assert.match(v69, /sh\.addEventListener\("click", function\(\)\{ if\(screenStream\) stopShare\(\); else startShare\(\); \}\);/);
  assert.ok(!/Scherm delen stoppen\?\\n|Wil je het overnemen\?/.test(html), 'no confirm dialogs around sharing');
  assert.match(html, /stream\.getVideoTracks\(\)\[0\]\.addEventListener\("ended", stopShare\);/, 'browser "stop sharing" / closed source');
  assert.match(v69, /if\(was && byShare && window\.__klasToggle\) window\.__klasToggle\("scr", false\); byShare = false; if\(was\) autoCam\(\);/);
});

test('slides toolbar: one row, compact in a narrow panel, full screen button', () => {
  assert.match(v69, /#pSl\{container-type:inline-size\}/);
  assert.match(v69, /flex-wrap:nowrap;white-space:nowrap/);
  assert.match(v69, /@container \(max-width:400px\)/);
  assert.match(v69, /pSl\.requestFullscreen\(\)/);
});

test('games: bigger stage inside the classroom only; translations for new texts', () => {
  const p = read('app/klaslokaal/live/page.tsx');
  assert.match(p, /\+GAME_STAGE\}/);
  assert.match(p, /\[data-mount\] \.gx-word\{font-size:clamp\(22px,3\.4cqi,40px\)\}/);
  assert.match(p, /\[data-mount\] \.gx-flip \.face strong\{font-size:clamp\(28px,5\.4cqi,64px\)\}/);
  const i18n = read('public/legacy/i18n.js');
  for (const k of ['Camerapaneel sluiten', 'Slides op volledig scherm', 'Zwevend venster openen']) assert.ok(i18n.includes(`"${k}":[`), k);
});
