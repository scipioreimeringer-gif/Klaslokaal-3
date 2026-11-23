// v45: clickable student/lesson in "Volgende les", Google Calendar mapping, scopes, token handling, webhook checks.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';
import {eventIdFor, isEventIdOfLesson, eventBody, toApply, relevant, mergeAttendees, defaultSummary, fp} from '../../lib/gcal/map.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const L = '3f2a1b4c-5d6e-4f70-8192-a3b4c5d6e7f8';
const row = {id: 1, op: 'upsert', lesson_id: L, event_id: null, starts_at: '2026-12-08T09:00:00Z', ends_at: '2026-12-08T10:00:00Z', timezone: 'America/Sao_Paulo', status: 'scheduled',
  language: null, title: null, description: null, student_id: 'sid', student_name: 'Sofia', student_email: 's@x.nl', curriculum_subject: 'pt'};

test('"Volgende les" and "Daarna": name/avatar → profile, date/row → lesson details, classroom button kept', () => {
  const a = read('components/Agenda.tsx');
  assert.match(a, /export const profileHref=\(l:Pick<Lesson,'student_id'>,mode:'teacher'\|'student'\)=>mode==='teacher'\?'\/leerlingen\?student='/);
  assert.match(a, /export const lessonHref=\(l:Pick<Lesson,'id'>\)=>'\/agenda\?les='\+encodeURIComponent\(l\.id\)/);
  assert.match(a, /<Link className="next-who who-link" href=\{profileHref\(next,mode\)\}/);
  assert.match(a, /<Link className="next-when when-link" href=\{lessonHref\(next\)\}/);
  assert.match(a, /<Link className="ar-who who-link" href=\{profileHref\(l,mode\)\}/);
  assert.match(a, /<Link className="ar-lesson" href=\{lessonHref\(l\)\}/);
  assert.match(a, /<Link className="button next-open" href=\{classroomHref\(next,mode\)\}>/); // v57: with the role
  assert.match(a, /<Link className="iconbtn ar-open" href=\{classroomHref\(l,mode\)\}/);
  assert.match(a, /from\('lessons'\)\.select\(LESSON_COLUMNS\)\.eq\('id',openId\)\.maybeSingle\(\)/, '/agenda?les=… opens the existing details (RLS applies)');
  assert.match(read('app/agenda/page.tsx'), /const openId=useQueryParam\('les'\);/);
});

test('stable event id per lesson (no duplicates): base32hex-safe, deterministic', () => {
  const id = eventIdFor(L);
  assert.equal(id, 'tr3f2a1b4c5d6e4f708192a3b4c5d6e7f8');
  assert.ok(/^[a-v0-9]{5,1024}$/.test(id), 'valid Google event id');
  assert.equal(eventIdFor(L.toUpperCase()), id); assert.ok(isEventIdOfLesson(id)); assert.ok(!isEventIdOfLesson('abc123'));
});
test('event body: date, start/end, time zone, student, language, title/description, private link back to the lesson', () => {
  const b = eventBody(row, {origin: 'https://teachyrooms4u.vercel.app'});
  assert.equal(b.summary, 'Les Portugees · Sofia');
  assert.equal(b.start.dateTime, '2026-12-08T09:00:00.000Z'); assert.equal(b.start.timeZone, 'America/Sao_Paulo'); assert.equal(b.end.timeZone, 'America/Sao_Paulo');
  assert.match(b.description, /klaslokaal\/live\?student=sid&lesson=3f2a1b4c/);
  assert.equal(b.extendedProperties.private.teachyLessonId, L); assert.equal(b.extendedProperties.private.teachyLang, 'pt');
  assert.ok(!('attendees' in b), 'no guests unless the teacher chose to invite');
  assert.deepEqual(eventBody({...row, title: 'Eigen titel'}, {origin: 'x'}).summary, 'Eigen titel');
  assert.equal(defaultSummary({...row, curriculum_subject: null}), 'Les · Sofia');
});
test('guests: the student once, other guests kept, case-insensitive', () => {
  assert.deepEqual(mergeAttendees([{email: 'S@X.nl'}, {email: 'ouder@x.nl'}], 's@x.nl'), [{email: 'S@X.nl'}, {email: 'ouder@x.nl'}]);
  assert.deepEqual(mergeAttendees([], 's@x.nl'), [{email: 's@x.nl'}]);
  assert.deepEqual(mergeAttendees(undefined, null), []);
});
test('Google → TeachyRooms: times + zone, cancel, all-day, own default texts are not taken over as title', () => {
  const b = eventBody(row, {origin: 'o'});
  const g = {id: eventIdFor(L), status: 'confirmed', updated: '2026-11-21T09:00:00Z', summary: b.summary, description: b.description, start: {dateTime: '2026-12-08T12:00:00-03:00', timeZone: 'America/Sao_Paulo'}, end: {dateTime: '2026-12-08T13:00:00-03:00'}, extendedProperties: b.extendedProperties};
  const a = toApply(g);
  assert.equal(a.start, '2026-12-08T12:00:00-03:00'); assert.equal(a.tz, 'America/Sao_Paulo'); assert.ok(!('summary' in a) && !('description' in a));
  assert.equal(toApply({...g, summary: 'Les verplaatst'}).summary, 'Les verplaatst');
  assert.deepEqual(toApply({id: 'x', status: 'cancelled', updated: 'u'}), {id: 'x', status: 'cancelled', updated: 'u'});
  assert.equal(toApply({...g, start: {date: '2026-12-08'}, end: {date: '2026-12-09'}}).all_day, true);
  assert.ok(relevant(g) && relevant({id: 'privé', status: 'cancelled'}) && !relevant({id: 'privé-afspraak', status: 'confirmed'}), 'other events are not even sent to the database');
  assert.equal(fp('abc'), fp('abc')); assert.notEqual(fp('abc'), fp('abd'));
});

test('OAuth: only the two calendar scopes, separate consent, offline access, signed state', () => {
  const s = read('lib/server/gcal.ts');
  assert.match(s, /GCAL_SCOPES = \['https:\/\/www\.googleapis\.com\/auth\/calendar\.calendarlist\.readonly', 'https:\/\/www\.googleapis\.com\/auth\/calendar\.events'\]/);
  const code = s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/auth\/calendar'|auth\/calendar"|gmail|drive|contacts|userinfo/i.test(code), 'no broader scopes');
  assert.match(s, /access_type: 'offline', prompt: 'select_account consent', include_granted_scopes: 'false'/);
  assert.match(s, /if \(!GCAL_SCOPES\.every\(s => granted\.includes\(s\)\)\)/, 'partial consent is refused with a clear message');
  assert.match(s, /return s\.u === uid && s\.e > Date\.now\(\);/, 'state bound to the user and time-limited');
  assert.match(s, /timingSafeEqual/);
});
test('tokens: encrypted AES-256-GCM before storing, never in client code; webhook checks the channel token hash', () => {
  const s = read('lib/server/gcal.ts');
  assert.match(s, /createCipheriv\('aes-256-gcm', key\(\), iv\)/);
  assert.match(s, /^import 'server-only';/);
  // same scheme round-trips and detects tampering
  const k = createHash('sha256').update('test-key').digest(), iv = randomBytes(12), c = createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update('1//refresh-token', 'utf8'), c.final()]), tag = c.getAuthTag();
  const d = createDecipheriv('aes-256-gcm', k, iv); d.setAuthTag(tag);
  assert.equal(Buffer.concat([d.update(ct), d.final()]).toString(), '1//refresh-token');
  const bad = createDecipheriv('aes-256-gcm', k, iv); bad.setAuthTag(tag); ct[0] ^= 1;
  assert.throws(() => Buffer.concat([bad.update(ct), bad.final()]));
  for (const f of ['components/GoogleCalendar.tsx', 'app/agenda/google/page.tsx', 'components/Agenda.tsx'])
    assert.ok(!/refresh_token|refresh_enc|access_token\b(?!\|\|)|GOOGLE_CLIENT_SECRET|GCAL_TOKEN_KEY/.test(read(f).replace(/data\.session\?\.access_token/g, '')), f + ': no tokens or secrets client-side');
  const w = read('app/api/calendar/webhook/route.ts');
  assert.match(w, /db\.rpc\('gcal_webhook_context', \{p_channel: channel, p_token_hash: hash\}\)/);
  assert.match(w, /if \(state === 'sync'\) return new Response\(null, \{status: 200\}\);/);
});
test('sync: local changes first, then incremental Google changes; expired sync token → full resync; channel renewed', () => {
  const s = read('lib/server/gcal.ts');
  assert.match(s, /if \(e instanceof GoogleError && e\.status === 410 && syncToken\) return pullChanges\(token, calendarId, null\);/);
  assert.match(s, /catch \(e\) \{ if \(e instanceof GoogleError && e\.status === 409\) ev = await g<GEvent>/, 'create of an existing id → update (idempotent)');
  assert.match(s, /const expiring = !ctx\.channel_expires_at \|\| Date\.parse\(ctx\.channel_expires_at\) < Date\.now\(\) \+ 2 \* 86400e3;/);
  assert.match(s, /if \(e instanceof RevokedError\) \{ await db\.rpc\('gcal_save_state'/, 'revoked/expired token is shown, not retried forever');
  const p = read('components/GoogleCalendar.tsx');
  assert.match(p, /'Opnieuw synchroniseren'/); assert.match(p, /'Google Calendar verbonden'/);
  assert.match(read('components/Agenda.tsx'), /onSaved=\{\(\)=>\{setForm\(null\);changed\(\)\}\}/); // v57: changed() = reload + requestCalendarSync
  assert.match(read('components/Agenda.tsx'), /const changed=\(\)=>\{reload\(\);requestCalendarSync\(\)\}/);
});
