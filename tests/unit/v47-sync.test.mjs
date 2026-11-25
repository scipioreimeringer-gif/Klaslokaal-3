// v47: games follow the teacher, student screen sharing, live Canvas selection, Picture-in-Picture.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const html = read('public/legacy/index.html'), games = read('components/Games.tsx');

test('games: the panel follows the teacher (open/close, also after a reconnect); no echo', () => {
  // v48: the panel now follows BOTH directions through the shared panel state (v48-sync.test.mjs)
  assert.match(html, /window\.__klasGames = function\(open\)\{ if\(!isT && !!OPEN\.games !== !!open\) setOpen\("games", !!open, "remote"\); \};/);
  assert.match(html, /case "gpanel": if\(window\.__klasGames\) window\.__klasGames\(m\.open\); break;/, 'older classroom version still understood');
});
test('games: the student opens once per game/round (a closed panel does not jump open on every tick); host timer resent', () => {
  assert.match(games, /const k=s\.id\+':'\+s\.round\+':'\+\(s\.phase==='ended'\?'end':'on'\);if\(s\.phase!=='ended'&&opened\.current!==k\)\{opened\.current=k;onOpen\(\)\}/);
  assert.match(games, /t-last>\(ref\.current\.phase==='running'\?4000:8000\)\)\{last=t;broadcast\(ref\.current\)\}/, 'one timer (the host), state resent in every phase');
  assert.match(games, /const onHello=\(\)=>\{if\(host\)broadcast\(ref\.current\)\};/, 'a reconnecting student gets the current state');
  assert.match(games, /if\(host&&mount&&ref\.current&&ref\.current\.phase!=='ended'&&!opened\.current\)\{opened\.current='restored';onOpen\(\)\}/);
  // hidden cards stay hidden: never in the shared state; only the explainer reads them (RLS) and only a guessing teacher gets none from the API
  assert.match(read('lib/games/state.ts'), /The shared state NEVER contains the cards/);
  assert.match(games, /from\('game_rounds'\)\.select\('cards'\)\.eq\('id',rid\)/);
  assert.match(read('app/api/games/round/route.ts'), /\.\.\.\(explainer === 'teacher' \? \{cards\} : \{\}\)/);
});
test('games fix: student without state asks for it; delivery via window events and split large messages', () => {
  assert.match(html, /window\.__klasGameSend = function\(m\)\{ if\(m && m\.t === "game"\) send\(m\); \};/);
  assert.match(html, /case "game": gameEvent\("teachy-game", m\); break;/);
  assert.match(html, /gameEvent\("teachy-peer-hello", null\);/);
  assert.match(games, /window\.addEventListener\('teachy-game',onMsg\)/);
  assert.match(games, /if\(a==='sync'\)broadcast\(ref\.current\)/, 'the host answers a sync request');
  assert.match(games, /if\(host\|\|state\)return;const ask=\(\)=>\{const on=online\(\);setLinked\(on\);if\(on\)send\(\{t:'game',k:'act',a:\{a:'sync'\},aid:crypto\.randomUUID\(\)\}\)\}/, 'only while connected, stops once the state is there');
  assert.ok(!/b\.onGame=/.test(games), 'no second delivery path');
});
test('screen sharing: students too, same screen-call type, shown in the existing Scherm panel; one sharer at a time', () => {
  assert.match(html, /if\(c\.metadata && c\.metadata\.type === "screen"\)\{\s*c\.answer\(\); inScr\[c\.peer\] = c;/, 'teacher receives a student screen (no second video system)');
  assert.match(html, /if\(isT\) Object\.keys\(conns\)\.forEach\(function\(id\)\{ if\(conns\[id\]\.open\) shareTo\(id\); \}\);\s*else shareTo\(TEACHER_ID\);/);
  // v69: no extra dialog; the other side is asked to stop only once a source was chosen in the browser picker
  assert.match(html, /\.then\(function\(stream\)\{\s*if\(takeOver\) send\(\{t:"scr", stop:true, by:isT \? "teacher" : "student"\}\);/);
  assert.match(html, /if\(m\.stop\)\{ if\(screenStream && !\(isT && m\.by === "teacher"\)\)\{ stopShare\(\);/);
  assert.match(html, /else if\(!m\.on && !screenStream && \(!m\.by \|\| m\.by === scrBy\)\) hideScreen\(\);/, 'only the screen of the one who stopped');
  assert.match(html, /if\(screenStream\)\{ var sk = screenStream; setTimeout\(function\(\)\{ if\(screenStream === sk\)\{ shareTo\(TEACHER_ID\);/, 'keeps sharing after a reconnect');
  assert.match(html, /if\(r && !screenStream\) hideScreen\(\);/, 'the student leaves → their screen disappears');
  assert.match(html, /scrV\.muted = scrBy === "self";/);
  assert.match(html, /<button class="btn sm" id="shareBtn" type="button"/); assert.match(html, /b\.id = "slShareBtn";/);
  assert.match(html, /getDisplayMedia\(\{video:\{frameRate:\{ideal:15, max:24\}\}, audio:true\}\)/, 'only after a click (browser asks)');
});
test('live Canvas selection: only block id + offsets, debounced, only when changed; never touches the own selection', () => {
  assert.match(html, /tm = setTimeout\(function\(\)\{ var s = current\(\), k = JSON\.stringify\(s\); if\(k === last\) return; last = k; send\(\{t:"cvsel", s:s\}\); \}, 120\);/);
  assert.match(html, /\.cvsel-layer\{position:absolute;inset:0;pointer-events:none;/);
  assert.match(html, /case "cvsel": if\(window\.__cvSelRemote\) window\.__cvSelRemote\(m\); break;/);
  assert.match(html, /var MARKS = \[\["#ffe98a", "Geel"\][^\n]*\["transparent", "Geen"\]\];/, 'permanent highlights = existing marker colours, removable');
  assert.match(html, /if\(st && st\.backgroundColor && /, '…kept by the safe filter, so they sync and persist with the text');
});
test('Picture-in-Picture: Document PiP with both cameras (muted copies), manual button, optional automatic; call untouched', () => {
  assert.match(html, /dpip\.requestWindow\(\{width:300, height:/);
  assert.match(html, /v\.autoplay = true; v\.muted = true;/, 'no double sound');
  assert.match(html, /setActionHandler\("enterpictureinpicture", function\(\)\{ if\(autoOn\(\) && peer && !pipWin\) openPip\(true\); \}\)/);
  assert.match(html, /cb\.id = "pipAuto";/);
  assert.match(html, /if\(host\.document\.visibilityState === "visible" && pipWin && autoOpened\)/, 'closes again when returning');
  const mod = html.slice(html.indexOf('v47: SCREEN SHARE BUTTON'), html.indexOf('v47: LIVE SELECTION IN THE CANVAS'));
  assert.ok(!/new Peer\(|getUserMedia|iceServers|TURN_SERVERS|peer\.call\(/.test(mod), 'WebRTC/PeerJS/TURN untouched');
});
