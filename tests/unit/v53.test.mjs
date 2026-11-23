// v53: the round's words for the guesser after the time is up; camera tiles fit their box; personal camera settings.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const games = read('components/Games.tsx'), html = read('public/legacy/index.html'), css = read('app/style.css');

test('games: after the round the explainer shares the words (guessed / not) — never while the round runs', () => {
  assert.match(games, /if\(!s\|\|s\.kind==='flash'\|\|!s\.roundId\|\|!explaining\|\|\(s\.phase!=='between'&&s\.phase!=='ended'\)\)return;/, 'only after the time is up');
  assert.match(games, /ok:s\.guessed\.includes\(i\)/);
  assert.match(games, /send\(m\);setTimeout\(\(\)=>send\(m\),2500\)/, 'sent twice over both routes');
  assert.match(games, /cur\.roundId===m\.roundId&&\(cur\.phase==='running'\|\|cur\.phase==='ready'\|\|cur\.phase==='paused'\)\)\)return;/, 'a reveal for a running round is ignored');
  assert.match(games, /\(s\.phase==='between'\|\|s\.phase==='ended'\)&&revealed&&!!revealed\.words\.length&&<div className="gx-reveal-list"/);
  assert.match(read('lib/games/state.ts'), /The shared state NEVER contains the cards/, 'the game state itself still has no cards');
  assert.match(css, /\.gx-reveal-list li\.ok\{/); assert.match(css, /\.gx-score span::before\{/);
});
test('camera: a video tile is exactly as high as its box (no more top half only)', () => {
  assert.match(html, /\.vbody \.remotes\{grid-auto-rows:minmax\(0,1fr\)!important;align-content:stretch\}/);
  assert.match(html, /\.vbody \.remotes video\{width:100%!important;height:100%!important;min-height:0;max-height:100%\}/);
  assert.match(html, /body\.cv-fit-contain \.vbody \.remotes video,body\.cv-fit-contain\.cam-duo \.vbody \.selfv\{object-fit:contain!important/, 'whole picture by default');
});
test('camera settings: views, fit, mirror, position/width; saved per person; nothing in the call changes', () => {
  const mod = html.slice(html.indexOf('v53: CAMERA SETTINGS'), html.indexOf('v47: SCREEN SHARE BUTTON'));
  assert.match(mod, /var KEY = "klas-camset-" \+ \(isT \? "t" : "s"\);/);
  for (const v of ['"auto", "Automatisch"', '"side", "Naast elkaar"', '"stack", "Onder elkaar"', '"pip", "De ander groot, ik klein"', '"other", "Alleen de ander"']) assert.ok(mod.includes(v), v);
  assert.match(mod, /data-fit="contain"/); assert.match(mod, /data-fit="cover"/); assert.match(mod, /id="v53Mirror"/);
  assert.match(mod, /function save\(\)\{ store\(KEY, S\); apply\(\); \}/);
  assert.match(mod, /window\.__camNoDuo = v === "other" \|\| v === "pip";/);
  assert.match(html, /B\.classList\.toggle\("cam-duo", hasR && hasS && !window\.__camNoDuo\);/);
  assert.match(mod, /document\.querySelector\('#camMenu \[data-camm="' \+ m \+ '"\]'\)/, 'position uses the existing camera modes');
  assert.ok(!/getUserMedia|new Peer\(|peer\.call\(|replaceTrack|\.stop\(\)/.test(mod), 'camera, microphone and WebRTC untouched');
});
