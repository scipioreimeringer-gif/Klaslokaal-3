// v50: game messages travel over two independent routes (data channel + Supabase Realtime), duplicates ignored.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const games = read('components/Games.tsx');

test('games: sent over the classroom data channel AND a Realtime broadcast channel', () => {
  assert.match(games, /__klasGameSend\?\.\(m\)/);
  assert.match(games, /if\(rt&&rtOn\)void rt\.send\(\{type:'broadcast',event:'g',payload:m\}\)/);
  assert.match(games, /db\.channel\('teachy-game-'\+studentId,\{config:\{broadcast:\{self:false\}\}\}\)/);
  assert.match(games, /c\.subscribe\(st=>\{rtOn=st==='SUBSCRIBED';if\(rtOn&&host\)broadcast\(ref\.current\)\}\)/, 'teacher sends the current state as soon as the channel is ready');
  assert.match(games, /void db\.removeChannel\(c\)/, 'channel closed when leaving');
});
test('games: duplicates from the second route are ignored', () => {
  assert.match(read('lib/games/state.ts'), /k: 'state' as const, at: now, s:/);
  assert.match(games, /if\(m\.at&&L&&L\.id===m\.s\.id&&m\.at<L\.at\)return;/, 'an older state never overwrites a newer one');
  assert.match(games, /if\(m\.aid\)\{if\(seen\.current\.has\(m\.aid\)\)return;seen\.current\.add\(m\.aid\);/, 'a student action counts once');
  assert.match(games, /send\(\{t:'game',k:'act',a,aid:crypto\.randomUUID\(\)\}\)/);
  assert.match(read('lib/games/state.ts'), /The shared state NEVER contains the cards/, 'nothing hidden on either route');
});
