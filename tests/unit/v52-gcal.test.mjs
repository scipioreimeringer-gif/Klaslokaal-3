// v52: Google Calendar — disconnect always works, withdrawn access is noticed, another account starts clean.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const route = read('app/api/calendar/[action]/route.ts'), lib = read('lib/server/gcal.ts'), ui = read('components/GoogleCalendar.tsx');

test('disconnect works also with invalid or withdrawn tokens and always removes the connection', () => {
  assert.match(route, /const ctx = await ctxOf\(db\)\.catch\(\(\) => null\);\n      if \(ctx\) \{\n        try \{ const token = await accessToken/);
  assert.match(route, /await revoke\(ctx\.refresh_enc\);\n      \}\n      const r = await db\.rpc\('gcal_disconnect'\);/);
  assert.match(lib, /try \{ plain = decrypt\(refreshEnc\); \} catch \{ throw new RevokedError\('unreadable'\); \}/);
  assert.match(lib, /export async function revoke\(refreshEnc: string\) \{ try \{/, 'revoking the old token is best effort');
});
test('withdrawn access is shown right away (also without a chosen calendar)', () => {
  assert.match(route, /if \(s\.connected && s\.status !== 'revoked' && gcalConfigured\(\)\)/);
  assert.match(route, /p_status: 'revoked', p_error: REVOKED/);
});
test('the disconnect button is always visible; not connected is shown clearly; no sync without a working connection', () => {
  assert.match(ui, /\{!open&&<button type="button" className="button small secondary danger-text gcal-off"/);
  assert.match(ui, /t\('Google Calendar niet verbonden'\)/);
  assert.match(ui, /if\(!s\?\.connected\|\|!s\.calendar_id\|\|s\.confirmed===false\|\|s\.status==='revoked'\)return;/);
  assert.match(ui, /st\.email\?st\.email\+' · ':''/, 'the connected account is shown');
});
test('another Google account: chooser always shown, old account cleaned up, nothing reused', () => {
  assert.match(lib, /prompt: 'select_account consent'/);
  assert.match(route, /if \(old && oldEmail !== email\) \{[\s\S]*?await revoke\(old\.refresh_enc\);[\s\S]*?db\.rpc\('gcal_disconnect'\)/);
  const m = read('supabase/v52.sql');
  assert.match(m, /lower\(old_email\) <> lower\(left\(p_email, 320\)\)/);
  assert.match(m, /delete from public\.calendar_links where teacher_id = me;/);
  assert.ok(!/delete from public\.lessons|update public\.lessons|drop table/i.test(m.replace(/--.*$/gm, '')), 'lessons and tables untouched');
});
