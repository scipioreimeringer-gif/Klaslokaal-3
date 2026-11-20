// v36: static checks of the classroom page (public/legacy/index.html): camera modes, work-panel tabs,
// pre-join check. The layout itself was checked by hand in a browser (desktop + phone width).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(path.join(root, 'public/legacy/index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const camModule = html.slice(html.indexOf('v36: CAMERA MODES'), html.indexOf('v36: CAMERA AND MICROPHONE CHECK'));

test('every inline script of the classroom still parses', () => {
  assert.ok(scripts.length >= 1);
  for (const s of scripts) assert.doesNotThrow(() => new vm.Script(s));
});
test('one work panel with tabs: whiteboard, slides, both, screen, games + full video', () => {
  for (const t of ['wb', 'sl', 'both', 'scr', 'games']) assert.match(html, new RegExp(`data-mview="${t}"`));
  assert.match(html, /data-cam="full"/);
  for (const id of ['pWb', 'pSl', 'pScr', 'pGames', 'gamesHost']) assert.match(html, new RegExp(`id="${id}"`));
});
test('camera modes: full, float, left, center, right, hidden; lock and width presets', () => {
  for (const m of ['full', 'float', 'left', 'center', 'right', 'hidden']) assert.match(html, new RegExp(`data-camm="${m}"`));
  for (const w of ['0.3', '0.4', '0.5']) assert.match(html, new RegExp(`data-camw="${w}"`));
  assert.match(html, /id="camLock"/); assert.match(html, /id="vShow"/); assert.match(html, /id="camSplit"/);
});
test('the lesson starts in full video unless the user locked a layout', () => {
  assert.match(camModule, /var mode = P\.lock && MODES\.indexOf\(P\.mode\) >= 0 \? P\.mode : "full"/);
});
test('layout is local: the camera module never sends anything to the other participant', () => {
  assert.ok(camModule.length > 1000);
  assert.ok(!/\bsend\(|deliver\(|__klasGameSend/.test(camModule));
  assert.match(camModule, /store\(KEY, P\)/, 'stored per user role on this device');
});
test('hiding the video does not touch camera, microphone or the connection', () => {
  const hide = camModule.slice(camModule.indexOf('function setMode'), camModule.indexOf('window.__camLayout'));
  assert.ok(!/getTracks|enabled\s*=|\.close\(|leave\(|destroy\(/.test(hide));
});
test('pre-join check reuses its stream (one permission prompt) and never blocks the classroom', () => {
  assert.match(html, /if\(window\.__preMedia && window\.__preMedia\.active\) return Promise\.resolve\(window\.__preMedia\);/);
  assert.match(html, /if\(window\.__noMedia\) return Promise\.resolve\(null\);/);
  assert.match(html, /id="preNoCam"/);
});
test('screen sharing gets its own tab and says who shares', () => {
  assert.match(html, /window\.__klasTab\("scr", "content"\)/);
  assert.match(html, /scrBy === "self" \? "Jij deelt je scherm" : scrBy === "student" \? "Je leerling deelt het scherm" : "Je docent deelt het scherm"/, 'v47: student can share too');
});
test('new classroom texts are translated', () => {
  const i18n = readFileSync(path.join(root, 'public/legacy/i18n.js'), 'utf8');
  for (const k of ['Vast links', 'Vast rechts', 'Zwevend', 'Video tonen', 'Indeling vergrendelen', 'Deelnemen', 'Scherm', 'Spelletjes']) assert.ok(i18n.includes(JSON.stringify(k) + ':'), k);
});
