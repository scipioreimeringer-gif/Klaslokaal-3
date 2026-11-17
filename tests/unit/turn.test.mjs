// v38: TURN/ICE configuration from the server environment, never in the public classroom file.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseIceServers, hasTurn} from '../../lib/turn.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// fictional example in the shape of the Metered "ICE Servers Array" (no real credentials)
const METERED_LIKE = JSON.stringify([
  {urls: 'stun:stun.relay.example.test:80'},
  {urls: 'turn:global.relay.example.test:80', username: 'user-example', credential: 'pass-example'},
  {urls: 'turn:global.relay.example.test:80?transport=tcp', username: 'user-example', credential: 'pass-example'},
  {urls: 'turn:global.relay.example.test:443', username: 'user-example', credential: 'pass-example'},
  {urls: 'turns:global.relay.example.test:443?transport=tcp', username: 'user-example', credential: 'pass-example'},
]);

test('the ICE Servers Array (JSON) is accepted as is', () => {
  const l = parseIceServers(METERED_LIKE);
  assert.equal(l.length, 5); assert.ok(hasTurn(l));
  assert.deepEqual(l[1], {urls: 'turn:global.relay.example.test:80', username: 'user-example', credential: 'pass-example'});
  assert.deepEqual(l[0], {urls: 'stun:stun.relay.example.test:80'}, 'STUN entries keep no credentials');
});
test('also {"iceServers":[...]} and urls as an array', () => {
  const l = parseIceServers(JSON.stringify({iceServers: [{urls: ['turn:a.example.test:3478', 'turns:a.example.test:443'], username: 'u', credential: 'c'}]}));
  assert.equal(l.length, 1); assert.deepEqual(l[0].urls, ['turn:a.example.test:3478', 'turns:a.example.test:443']);
});
test('missing, empty or invalid configuration → empty list (STUN only, the classroom keeps working)', () => {
  for (const raw of [undefined, null, '', '   ', 'not json', '{"a":1}', '42', '[1,2]']) assert.deepEqual(parseIceServers(raw), [], String(raw));
});
test('unsafe or incomplete entries are dropped', () => {
  const l = parseIceServers(JSON.stringify([
    {urls: 'turn:x.example.test:3478'},                                   // TURN without credentials
    {urls: 'https://evil.example.test', username: 'u', credential: 'c'},  // not an ICE url
    {urls: 'turn:ok.example.test:3478', username: 'u', credential: 'c', extra: 'ignored'},
  ]));
  assert.deepEqual(l, [{urls: 'turn:ok.example.test:3478', username: 'u', credential: 'c'}]);
});
test('the public classroom file contains no TURN credentials any more', () => {
  const html = readFileSync(path.join(root, 'public/legacy/index.html'), 'utf8');
  assert.ok(!/credential\s*:/.test(html), 'no credential: in the public file');
  assert.ok(!/username\s*:\s*"/.test(html), 'no username: in the public file');
  assert.ok(!/relay\.metered\.ca|expressturn\.com/.test(html), 'no TURN hosts hard-coded');
  assert.match(html, /var TURN_SERVERS = \[\];/);
  assert.match(html, /b\.iceServers\(\)/, 'TURN comes from the server via the bridge');
});

test('TURN is only given to the teacher or student of this classroom (route checks access)', () => {
  const route = readFileSync(path.join(root, 'app/api/turn/route.ts'), 'utf8');
  assert.match(route, /await authUser\(req\)/, 'logged in');
  assert.match(route, /await studentAccess\(db, user\.id, studentId\)/, 'teacher or linked student of this classroom');
  assert.match(route, /no-store/, 'never cached');
  assert.match(readFileSync(path.join(root, 'lib/classroomBridge.ts'), 'utf8'), /\/api\/turn\?student=/);
});
test('camera ~480p, max 24 fps, capped bitrate; screen sharing not capped; relay test mode and route info', () => {
  const html = readFileSync(path.join(root, 'public/legacy/index.html'), 'utf8');
  assert.equal((html.match(/width:\{ideal:640, max:640\}, height:\{ideal:480, max:480\}, frameRate:\{ideal:24, max:24\}/g) || []).length, 2, 'call and pre-join check');
  assert.match(html, /maxBitrate = 600000/);
  assert.match(html, /s\.track\.kind !== "video"/, 'only the camera video sender of the call');
  assert.ok(!/shareTo[\s\S]{0,400}capVideo/.test(html), 'screen-share call is not capped');
  assert.match(html, /if\(RELAY_TEST\) ICE\.iceTransportPolicy = "relay"/);
  assert.match(html, /netRoute = relay \? "via TURN" : "direct"/);
});

test('the JavaScript notation from the Metered dashboard is accepted too (no eval)', async () => {
  const {readIceServers} = await import('../../lib/turn.ts');
  const js = `[
      {
        urls: "stun:stun.relay.example.test:80",
      },
      {
        urls: "turn:global.relay.example.test:80",
        username: "user-example",
        credential: "pass:with:colons",
      },
      {
        urls: 'turns:global.relay.example.test:443?transport=tcp',
        username: 'user-example',
        credential: 'pass-example',
      },
  ]`;
  for (const raw of [js, 'const iceServers = ' + js + ';', 'iceServers: ' + js, js.replace(/\n/g, ' ')]) {
    const r = readIceServers(raw);
    assert.equal(r.status, 'ok', raw.slice(0, 30));
    assert.equal(r.servers.length, 3);
    assert.equal(r.servers[1].credential, 'pass:with:colons', 'string contents untouched');
    assert.equal(r.servers[2].urls, 'turns:global.relay.example.test:443?transport=tcp');
  }
});
test('status says why there is no TURN (never the value itself)', async () => {
  const {readIceServers} = await import('../../lib/turn.ts');
  assert.equal(readIceServers('').status, 'missing');
  assert.equal(readIceServers(undefined).status, 'missing');
  assert.equal(readIceServers('hallo').status, 'invalid_parse');
  assert.equal(readIceServers('[{urls:"turn:x.example.test:3478"}]').status, 'turn_without_credentials', 'TURN without credentials');
  assert.equal(readIceServers('[{"urls":"stun:s.example.test:3478"}]').status, 'no_turn');
  assert.equal(readIceServers('{"iceServers":[{"urls":"turn:t.example.test:3478","username":"u","credential":"c"}]}').status, 'ok');
});

test('the array is found inside a code snippet (RTCPeerConnection, comments, quoted value)', async () => {
  const {readIceServers} = await import('../../lib/turn.ts');
  const arr = `[
        { urls: "stun:stun.relay.example.test:80" },
        { urls: "turn:global.relay.example.test:80", username: "user-example", credential: "pass//not-a-comment" },
        { urls: "turns:global.relay.example.test:443?transport=tcp", username: "user-example", credential: "pass-example" },
      ]`;
  const snippets = [
    `var myPeerConnection = new RTCPeerConnection({\n  // Metered TURN servers\n  iceServers: ${arr},\n});`,
    `const peerConfiguration = {\n  /* free tier */\n  iceServers: ${arr}\n};`,
    JSON.stringify(JSON.stringify([{urls: 'turn:q.example.test:3478', username: 'u', credential: 'c'}])), // value wrapped in quotes
  ];
  for (const raw of snippets) {
    const r = readIceServers(raw);
    assert.equal(r.status, 'ok', raw.slice(0, 40));
  }
  const r = readIceServers(snippets[0]);
  assert.equal(r.servers.length, 3); assert.equal(r.servers[1].credential, 'pass//not-a-comment', '// inside a string is not a comment');
});
test('specific reasons when the value cannot be used', async () => {
  const {readIceServers} = await import('../../lib/turn.ts');
  assert.equal(readIceServers('just some text').status, 'invalid_parse');
  assert.equal(readIceServers('[{"urls":"https://x.example.test"}]').status, 'invalid_entries');
  assert.equal(readIceServers('[{urls:"turn:x.example.test:3478"}]').status, 'turn_without_credentials');
});
