// v46 phase 1: shared Canvas open/close, two equal cameras, drawing on slides on/off, images in the Canvas.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const html = read('public/legacy/index.html');
const fnSrc = name => { const i = html.indexOf('function ' + name + '('); let d = 0, j = html.indexOf('{', i); for (let k = j; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}' && --d === 0) return html.slice(i, k + 1); } };

test('Canvas: open for both on entering; deliberate open/close shared, newest decision wins, no echo', () => {
  // v48: generalised to shared panels (Canvas, Bord, Spelletjes) in both directions — see v48-sync.test.mjs
  assert.match(html, /OPEN\.cv = psFresh\(PS\.cv\) \? !!PS\.cv\.open : true;/);
  assert.match(html, /if\(!at \|\| \(PS\[k\] && PS\[k\]\.at >= at\)\) return;/, 'older or equal decisions are ignored');
  assert.match(html, /setOpen\(k, !!x\.open, "remote"\);/, 'remote changes are applied without being sent back');
  assert.match(html, /else setOpen\(k, false, "user"\); \}\);/, 'the X is a deliberate close');
  assert.match(html, /case "cvopen": if\(window\.__cvRemote\) window\.__cvRemote\(m\); break;/, 'an older classroom version is still understood');
  assert.match(html, /tConn\.on\("open", function\(\)\{ joinedAt = Date\.now\(\); send\(\{t:"hello"\}\); if\(window\.__cvShare\) window\.__cvShare\(\);/, 'the student shares its decision on (re)connect');
  const ss = fnSrc('sendState');
  assert.match(ss, /if\(window\.__cvShare\) window\.__cvShare\(\);/);
  assert.ok(!/send\(\{t:"mode", m:mode\}\)/.test(ss), 'reconnecting no longer opens the board at the student');
  assert.match(html, /if\(OPEN\.cv && window\.__camWork\) window\.__camWork\("auto"\);/, 'cameras stay visible next to the Canvas');
});
test('cameras: two equal tiles (stacked when docked), cover, names; alone = full; WebRTC untouched', () => {
  assert.match(html, /B\.classList\.toggle\("cam-duo", hasR && hasS\);/);
  assert.match(html, /body\.cam-duo \.vbody\{display:flex;flex-direction:column;/);
  assert.match(html, /body\.cam-duo \.vbody \.remotes\{position:relative;inset:auto;flex:1 1 0;/);
  assert.match(html, /body\.cam-duo \.vbody \.selfv\{[^}]*flex:1 1 0;[^}]*object-fit:cover/);
  assert.match(html, /body\.cam-solo-self \.vbody \.selfv\{inset:0!important;width:100%!important/);
  const mod = html.slice(html.indexOf('v46: CAMERAS, SLIDE INK, CANVAS IMAGES'), html.indexOf('---- 2. Drawing on slides'));
  assert.ok(!/new Peer\(|getUserMedia|iceServers|\.call\(|srcObject\s*=/.test(mod), 'only classes and labels change');
});
test('slides: drawing off by default; teacher decides for both; off = layer lets everything through; annotations saved per PDF slide', () => {
  assert.match(html, /on = !!\(s && s\.on && Date\.now\(\) - \(s\.at \|\| 0\) < 6 \* 3600e3\);/);
  assert.match(html, /body:not\(\.sl-ink\) #slSurf \.dc\{pointer-events:none;/);
  assert.match(html, /function set\(v, remote\)\{ on = !!v; store\(KEY, \{on:on, at:Date\.now\(\)\}\); apply\(\); if\(!remote && isT\) send\(\{t:"slink", on:on\}\); \}/);
  assert.match(html, /window\.__slInkRemote = function\(m\)\{ if\(!isT\) set\(!!m\.on, true\); \};/);
  assert.match(html, /b\.disabled = !isT;/, 'the student sees the mode, cannot change it');
  assert.match(html, /var id = \(doc\.fingerprints && doc\.fingerprints\[0\]\)/, 'same PDF = same slide keys');
  assert.match(html, /if\(k\.indexOf\("p:"\) === 0 && \(objs\[k\] \|\| \[\]\)\.length\) d\.objs\[k\] = /);
  assert.match(html, /if\(k\.indexOf\("wb:"\) === 0 \|\| k\.indexOf\("p:"\) === 0\) objs\[k\] = d\.objs\[k\];/);
  assert.match(html, /\|\| !\(SL\.screen \|\| !document\.body\.classList\.contains\("sl-ink"\)\) \|\|/, 'drawing off: drag moves a zoomed slide');
});
test('Canvas images: only a Storage reference + width are stored/sent, never the temporary link or base64', () => {
  const src = fnSrc('cvOut');
  const IMG_RE = /^[0-9a-f-]{36}\/[0-9a-f]{64}\.(png|jpg|webp|gif)$/;
  const cvOut = new Function('IMG_RE', src + '; return cvOut;')(IMG_RE);
  const p = '11111111-2222-4333-8444-555555555555/' + 'a'.repeat(64) + '.png';
  assert.equal(cvOut(`<div class="b" data-t="img"><img data-img="${p}" data-w="45" src="https://x.supabase.co/sign?token=abc" style="width:45%" class="sel"></div>`),
    `<div class="b" data-t="img"><img data-img="${p}" data-w="45" alt=""></div>`);
  assert.equal(cvOut('<img src="data:image/png;base64,AAAA">'), '', 'base64 / foreign images are dropped');
  assert.equal(cvOut(`<img data-img="../etc/passwd" data-w="50">`), '');
  assert.equal(cvOut(`<img data-img="${p}" data-w="900">`), `<img data-img="${p}" data-w="100" alt="">`);
  for (const f of ['cvSync', 'cvSendAll']) assert.match(fnSrc(f), /cvOut\(b\.innerHTML\)/, f);
  assert.match(html, /curPage\(\)\.html = cvOut\(CV\.innerHTML\);/);
  assert.match(html, /if\(c\.nodeType === 1 && c\.tagName === "IMG"\)\{/, 'incoming HTML: images reduced to reference + width');
  assert.match(html, /b\.setAttribute\("data-t", \/\^\(h\|h2\|h3\|li\|img\)\$\/\.test\(m\.bt\)/);
});
test('Canvas images: button, paste, drag-and-drop, web images where allowed; select, resize (aspect kept), move, delete', () => {
  assert.match(html, /CV\.addEventListener\("paste", function\(e\)\{\s*var cd = e\.clipboardData;/);
  assert.match(html, /page\.addEventListener\("drop", function\(e\)\{/);
  assert.match(html, /fetch\(url, \{mode:"cors"\}\)/);
  assert.match(html, /ib\.id = "cvImgBtn";/);
  assert.match(html, /sel\.setAttribute\("data-w", String\(pct\)\); sel\.style\.width = pct \+ "%";/, 'width only → aspect ratio kept');
  assert.match(html, /\.cv img\[data-img\]\{display:block;max-width:100%;height:auto;/, 'never wider than the Canvas');
  assert.match(html, /if\(!allowed\(\)\)\{ toast\("Je docent heeft typen voor jou uitgezet"\); return; \}/, 'existing typing permission respected');
  const b = read('lib/classroomBridge.ts');
  assert.match(b, /export function sniffImage\(b: Uint8Array\)/, 'type checked by content, not just by name');
  assert.match(b, /if \(file\.size > CANVAS_IMG_MAX\)/);
  assert.match(b, /const path = `\$\{studentId\}\/\$\{hash\}\.\$\{ext\}`;/, 'SHA-256 name → no double uploads');
  assert.match(b, /\.\.\.canvasImages\(db, opts\.studentId\),/);
  assert.match(read('supabase/v46.sql'), /values \('canvas-images', 'canvas-images', false, 5242880/);
});
