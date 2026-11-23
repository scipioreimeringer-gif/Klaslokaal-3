import 'server-only';
// v45: Google Calendar (official REST API v3 + OAuth 2.0) — server only. Tokens never leave the server in plain text:
// the refresh token is encrypted (AES-256-GCM, key GCAL_TOKEN_KEY) before it is stored; access tokens live only in memory.
import {createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {HttpError} from './ai';
import {eventBody, eventIdFor, mergeAttendees, relevant, toApply, type GEvent, type OutboxRow} from '../gcal/map';
import {extraEventBody, extraEventId, extraFingerprint, type ExtraItem} from '../gcal/items';

/** Only what is needed: list the teacher's calendars (read-only) and manage events. No Gmail, Drive, contacts or profile. */
export const GCAL_SCOPES = ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events'];
const API = 'https://www.googleapis.com/calendar/v3';

export function gcalConfigured() { return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GCAL_TOKEN_KEY); }
function need() { if (!gcalConfigured()) throw new HttpError(503, 'Google Calendar is nog niet ingesteld op de server (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GCAL_TOKEN_KEY).'); }
const key = () => createHash('sha256').update(String(process.env.GCAL_TOKEN_KEY)).digest();

export function encrypt(plain: string) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
export function decrypt(enc: string) {
  if (!enc?.startsWith('v1:')) throw new Error('bad token');
  const b = Buffer.from(enc.slice(3), 'base64'), d = createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** OAuth state: who started the connection, signed by the server, valid 10 minutes (CSRF + no account mix-ups). */
export function signState(uid: string) {
  const body = Buffer.from(JSON.stringify({u: uid, e: Date.now() + 600e3, n: randomUUID()})).toString('base64url');
  return body + '.' + createHmac('sha256', key()).update(body).digest('base64url');
}
export function verifyState(state: string, uid: string) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) return false;
  const want = createHmac('sha256', key()).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return false;
  const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as {u: string; e: number};
  return s.u === uid && s.e > Date.now();
}

export function authUrl(redirectUri: string, state: string) {
  need();
  const p = new URLSearchParams({client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri, response_type: 'code', scope: GCAL_SCOPES.join(' '),
    // v52: select_account → Google always lets the teacher choose the account (never silently the old one)
    access_type: 'offline', prompt: 'select_account consent', include_granted_scopes: 'false', state});
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
}

export class GoogleError extends Error { status: number; reason: string; constructor(status: number, reason: string, msg: string) { super(msg); this.status = status; this.reason = reason; } }
export class RevokedError extends Error {}

async function tokenCall(params: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params})});
  const j = await r.json().catch(() => ({})) as {access_token?: string; refresh_token?: string; scope?: string; error?: string; error_description?: string};
  if (!r.ok) { if (j.error === 'invalid_grant') throw new RevokedError('revoked'); throw new GoogleError(r.status, j.error || 'token', j.error_description || 'Google-aanmelding mislukt'); }
  return j;
}
export async function exchangeCode(code: string, redirectUri: string) {
  need();
  const j = await tokenCall({code, redirect_uri: redirectUri, grant_type: 'authorization_code'});
  if (!j.refresh_token) throw new HttpError(400, 'Google gaf geen blijvende toegang terug. Probeer opnieuw te verbinden.');
  const granted = String(j.scope || '').split(' ');
  if (!GCAL_SCOPES.every(s => granted.includes(s))) throw new HttpError(400, 'Geef TeachyRooms toegang tot je agenda’s en afspraken (beide vinkjes) om te synchroniseren.');
  return {access: j.access_token!, refresh: j.refresh_token};
}
export async function accessToken(refreshEnc: string) {
  need();
  let plain: string;
  try { plain = decrypt(refreshEnc); } catch { throw new RevokedError('unreadable'); } // v52: a token we cannot read is as good as revoked
  return (await tokenCall({refresh_token: plain, grant_type: 'refresh_token'})).access_token!;
}
export async function revoke(refreshEnc: string) { try { await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(decrypt(refreshEnc)), {method: 'POST'}); } catch { /* best effort */ } }

async function g<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(API + path, {...init, headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(init.headers || {})}, cache: 'no-store'});
  if (r.status === 204) return undefined as T;
  const j = await r.json().catch(() => ({})) as {error?: {message?: string; errors?: {reason?: string}[]}};
  if (!r.ok) throw new GoogleError(r.status, j.error?.errors?.[0]?.reason || String(r.status), j.error?.message || 'Google Calendar gaf een fout');
  return j as T;
}

export async function listCalendars(token: string) {
  const j = await g<{items?: {id: string; summary: string; primary?: boolean; accessRole: string; timeZone?: string; backgroundColor?: string}[]}>(token, '/users/me/calendarList?minAccessRole=writer&maxResults=250');
  return (j.items || []).map(c => ({id: c.id, name: c.summary, primary: !!c.primary, timeZone: c.timeZone || null, color: c.backgroundColor || null}));
}
export async function primaryEmail(token: string) { try { return (await g<{id: string}>(token, '/calendars/primary')).id; } catch { return null; } }

const enc = encodeURIComponent;
/** Send the pending local changes. Create = insert with the stable event id (409 → it already exists → update). */
export async function pushOutbox(db: SupabaseClient, token: string, ctx: {calendar_id: string; invite: boolean}, origin: string) {
  let sent = 0, failed = 0;
  for (let round = 0; round < 5; round++) {
    const {data, error} = await db.rpc('gcal_outbox', {p_limit: 50});
    if (error) throw new Error(error.message);
    const rows = (data || []) as OutboxRow[];
    if (!rows.length) break;
    for (const r of rows) {
      const cal = enc(ctx.calendar_id), id = r.event_id || eventIdFor(r.lesson_id), send = ctx.invite && r.student_email ? 'all' : 'none';
      try {
        let updated: string | null = new Date().toISOString();
        if (r.op === 'delete' || !r.starts_at || r.status === 'cancelled') {
          try { await g(token, `/calendars/${cal}/events/${enc(id)}?sendUpdates=${send}`, {method: 'DELETE'}); }
          catch (e) { if (!(e instanceof GoogleError && (e.status === 404 || e.status === 410))) throw e; }
        } else {
          let attendees: {email: string}[] | null = null, exists = true;
          try { const cur = await g<GEvent & {attendees?: {email?: string}[]}>(token, `/calendars/${cal}/events/${enc(id)}`); if (ctx.invite) attendees = mergeAttendees(cur.attendees, r.student_email); }
          catch (e) { if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) exists = false; else throw e; }
          if (!exists && ctx.invite) attendees = mergeAttendees([], r.student_email);
          const body = JSON.stringify(eventBody(r, {origin, attendees}));
          let ev: GEvent;
          if (exists) ev = await g<GEvent>(token, `/calendars/${cal}/events/${enc(id)}?sendUpdates=${send}`, {method: 'PATCH', body});
          else {
            try { ev = await g<GEvent>(token, `/calendars/${cal}/events?sendUpdates=${send}`, {method: 'POST', body: JSON.stringify({id, ...JSON.parse(body)})}); }
            catch (e) { if (e instanceof GoogleError && e.status === 409) ev = await g<GEvent>(token, `/calendars/${cal}/events/${enc(id)}?sendUpdates=${send}`, {method: 'PATCH', body}); else throw e; }
          }
          updated = ev.updated || updated;
        }
        await db.rpc('gcal_outbox_done', {p_id: r.id, p_event_id: id, p_updated: updated, p_error: null});
        sent++;
      } catch (e) {
        if (e instanceof RevokedError) throw e;
        failed++;
        await db.rpc('gcal_outbox_done', {p_id: r.id, p_event_id: null, p_updated: null, p_error: e instanceof Error ? e.message : String(e)});
      }
    }
  }
  return {sent, failed};
}

/** Incremental sync with the stored sync token; 410 = token expired → full resync (recovery for missed notifications). */
export async function pullChanges(token: string, calendarId: string, syncToken: string | null) {
  const events: Record<string, unknown>[] = [];
  let page: string | undefined, next: string | null = null;
  const base = `/calendars/${enc(calendarId)}/events?maxResults=250&showDeleted=true&fields=${enc('nextPageToken,nextSyncToken,items(id,status,updated,summary,description,start,end,extendedProperties,recurringEventId)')}`;
  for (let i = 0; i < 40; i++) {
    let j: {items?: GEvent[]; nextPageToken?: string; nextSyncToken?: string};
    try { j = await g(token, base + (syncToken ? '&syncToken=' + enc(syncToken) : '') + (page ? '&pageToken=' + enc(page) : '')); }
    catch (e) { if (e instanceof GoogleError && e.status === 410 && syncToken) return pullChanges(token, calendarId, null); throw e; }
    for (const e of j.items || []) if (relevant(e)) events.push(toApply(e));
    if (j.nextPageToken) { page = j.nextPageToken; continue; }
    next = j.nextSyncToken || null; break;
  }
  return {events, syncToken: next, full: !syncToken};
}

/** Push notifications (Google calls our webhook). Channels expire; they are renewed during a sync. */
export async function watch(token: string, calendarId: string, address: string) {
  const id = randomUUID(), secret = randomBytes(24).toString('base64url');
  const j = await g<{resourceId: string; expiration?: string}>(token, `/calendars/${enc(calendarId)}/events/watch`, {method: 'POST',
    body: JSON.stringify({id, type: 'web_hook', address, token: secret, params: {ttl: String(7 * 86400)}})});
  return {id, resourceId: j.resourceId, tokenHash: sha256(secret), expires: j.expiration ? new Date(+j.expiration).toISOString() : new Date(Date.now() + 7 * 86400e3).toISOString()};
}
export async function stopChannel(token: string, id: string | null, resourceId: string | null) {
  if (!id || !resourceId) return;
  try { await g(token, '/channels/stop', {method: 'POST', body: JSON.stringify({id, resourceId})}); } catch { /* already gone */ }
}

/** Database client without a user (webhook): it can only call the two channel-token-checked functions. */
export function anonDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {auth: {persistSession: false, autoRefreshToken: false}});
}

export type Ctx = {refresh_enc: string; calendar_id: string | null; sync_token: string | null; invite: boolean; channel_id: string | null; resource_id: string | null; channel_expires_at: string | null; status: string;
  confirmed?: boolean; sync_teaching?: boolean; sync_learning?: boolean; sync_personal?: boolean};

/** v57: one-way part — lessons I follow and personal appointments → the chosen calendar (stable ids, unchanged ones skipped). */
type ExtraPlan = {want: (ExtraItem & {event_id: string | null; fingerprint: string | null})[]; remove: {item_id: string; event_id: string}[]};
export async function pushExtras(db: SupabaseClient, token: string, calendarId: string, origin: string) {
  const {data, error} = await db.rpc('gcal_extra_plan');
  if (error) throw new Error(error.message);
  const plan = (data || {want: [], remove: []}) as ExtraPlan, cal = enc(calendarId);
  let sent = 0, removed = 0, failed = 0;
  for (const it of plan.want) {
    const f = extraFingerprint(it, origin);
    if (it.event_id && it.fingerprint === f) continue;
    const id = it.event_id || extraEventId(it), body = JSON.stringify(extraEventBody(it, origin));
    try {
      try { await g(token, `/calendars/${cal}/events/${enc(id)}`, {method: 'PUT', body}); }
      catch (e) {
        if (!(e instanceof GoogleError && (e.status === 404 || e.status === 410))) throw e;
        try { await g(token, `/calendars/${cal}/events`, {method: 'POST', body: JSON.stringify({id, ...JSON.parse(body)})}); }
        catch (e2) { if (e2 instanceof GoogleError && e2.status === 409) await g(token, `/calendars/${cal}/events/${enc(id)}`, {method: 'PUT', body}); else throw e2; }
      }
      await db.rpc('gcal_extra_done', {p_kind: it.kind, p_item: it.item_id, p_event_id: id, p_fingerprint: f, p_removed: false});
      sent++;
    } catch (e) { if (e instanceof RevokedError) throw e; failed++; }
  }
  for (const r of plan.remove) {
    try {
      try { await g(token, `/calendars/${cal}/events/${enc(r.event_id)}`, {method: 'DELETE'}); }
      catch (e) { if (!(e instanceof GoogleError && (e.status === 404 || e.status === 410))) throw e; }
      await db.rpc('gcal_extra_done', {p_kind: 'learn', p_item: r.item_id, p_event_id: r.event_id, p_fingerprint: null, p_removed: true});
      removed++;
    } catch { failed++; }
  }
  return {sent, removed, failed};
}

/** One full sync for the logged-in teacher: send local changes, read Google changes, keep push notifications alive. */
export async function syncTeacher(db: SupabaseClient, origin: string, webhookUrl: string | null) {
  const {data, error} = await db.rpc('gcal_context');
  if (error) throw new HttpError(500, error.message);
  const ctx = data as Ctx | null;
  if (!ctx) throw new HttpError(404, 'Google Calendar is niet verbonden.');
  if (!ctx.calendar_id) return {needsCalendar: true};
  if (ctx.confirmed === false) return {needsConsent: true};                       // v57: nothing is sent before the explicit choice
  let token: string;
  try { token = await accessToken(ctx.refresh_enc); }
  catch (e) {
    if (e instanceof RevokedError) { await db.rpc('gcal_save_state', {p_sync_token: null, p_reset_sync: false, p_channel_id: null, p_resource_id: null, p_token_hash: null, p_expires: null, p_status: 'revoked', p_error: 'Google heeft de toegang ingetrokken of de verbinding is verlopen. Verbind Google Calendar opnieuw.'}); throw new HttpError(409, 'Google heeft de toegang ingetrokken. Verbind Google Calendar opnieuw.'); }
    throw e;
  }
  const push = await pushOutbox(db, token, {calendar_id: ctx.calendar_id, invite: ctx.invite}, origin);
  const pulled = await pullChanges(token, ctx.calendar_id, ctx.sync_token);
  // a full resync only refreshes the token baseline: everything already linked is compared by its "updated" time
  const applied = await db.rpc('gcal_apply', {p_events: pulled.events, p_sync_token: pulled.syncToken});
  if (applied.error) throw new HttpError(500, applied.error.message);
  if (pulled.events.length) await pushOutbox(db, token, {calendar_id: ctx.calendar_id, invite: ctx.invite}, origin); // conflicts write TeachyRooms back
  // v57: lessons I follow + personal appointments (one way); before v57.sql the plan function is missing → skipped
  const extra = await pushExtras(db, token, ctx.calendar_id, origin).catch(e => { if (e instanceof RevokedError) throw e; return {sent: 0, removed: 0, failed: /gcal_extra_plan/.test(String(e)) ? 0 : 1}; });
  push.sent += extra.sent + extra.removed; push.failed += extra.failed;
  let channel: Awaited<ReturnType<typeof watch>> | null = null, pushError: string | null = null;
  const expiring = !ctx.channel_expires_at || Date.parse(ctx.channel_expires_at) < Date.now() + 2 * 86400e3;
  if (webhookUrl && expiring) {
    try { channel = await watch(token, ctx.calendar_id, webhookUrl); await stopChannel(token, ctx.channel_id, ctx.resource_id); }
    catch (e) { pushError = e instanceof Error ? e.message : String(e); }
  }
  await db.rpc('gcal_save_state', {p_sync_token: null, p_reset_sync: false, p_channel_id: channel?.id || null, p_resource_id: channel?.resourceId || null,
    p_token_hash: channel?.tokenHash || null, p_expires: channel?.expires || null, p_status: 'ok', p_error: push.failed ? 'Niet alle lessen konden naar Google Calendar worden gestuurd. Probeer opnieuw te synchroniseren.' : null});
  return {sent: push.sent, failed: push.failed, ...(applied.data as object), push: channel ? 'renewed' : pushError ? 'unavailable' : 'active', pushError};
}
