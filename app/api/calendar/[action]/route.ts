// v45: Google Calendar for teachers — status, connect (OAuth), calendars, sync, settings, disconnect.
// Every action runs with the teacher's own Supabase session (RLS + checked functions); tokens stay on the server.
import {authUser, HttpError, jsonError} from '../../../../lib/server/ai';
import {accessToken, authUrl, encrypt, exchangeCode, gcalConfigured, listCalendars, primaryEmail, revoke, RevokedError, signState, stopChannel, syncTeacher, verifyState, type Ctx} from '../../../../lib/server/gcal';

export const maxDuration = 60;
const REVOKED = 'Google heeft de toegang ingetrokken of de verbinding is verlopen. Ontkoppel en verbind Google Calendar opnieuw.';
export const dynamic = 'force-dynamic';

const originOf = (req: Request) => new URL(req.url).origin;
const redirectOf = (req: Request) => originOf(req) + '/agenda/google';
function webhookOf(req: Request) {
  const u = process.env.GCAL_WEBHOOK_URL || originOf(req) + '/api/calendar/webhook';
  return /^https:\/\//.test(u) ? u : null; // Google only calls https addresses (local development: sync on open/click)
}

async function ctxOf(db: Awaited<ReturnType<typeof authUser>>['db']) {
  const {data, error} = await db.rpc('gcal_context');
  if (error) throw new HttpError(/gcal_context/.test(error.message) ? 503 : 500, /gcal_context/.test(error.message) ? 'Voer eerst supabase/v45.sql uit.' : error.message);
  return data as Ctx | null;
}

export async function GET(req: Request, {params}: {params: Promise<{action: string}>}) {
  try {
    const {action} = await params;
    const {db} = await authUser(req);
    if (action === 'status') {
      const r = await db.rpc('gcal_status');
      if (r.error) return Response.json({configured: gcalConfigured(), migration: false, connected: false});
      const s = r.data as {connected?: boolean; status?: string};
      // v52: access withdrawn in the Google account (or an unreadable token) is noticed right away, also when no
      // calendar was chosen yet (then no sync runs) — the agenda shows it and offers to disconnect / reconnect
      if (s.connected && s.status !== 'revoked' && gcalConfigured()) {
        const ctx = await ctxOf(db).catch(() => null);
        if (ctx) try { await accessToken(ctx.refresh_enc); } catch (e) {
          if (e instanceof RevokedError) {
            await db.rpc('gcal_save_state', {p_sync_token: null, p_reset_sync: false, p_channel_id: null, p_resource_id: null, p_token_hash: null, p_expires: null, p_status: 'revoked', p_error: REVOKED});
            return Response.json({configured: true, migration: true, ...s, status: 'revoked', last_error: REVOKED, push: false});
          }
        }
      }
      return Response.json({configured: gcalConfigured(), migration: true, ...s});
    }
    if (action === 'calendars') {
      const ctx = await ctxOf(db);
      if (!ctx) throw new HttpError(404, 'Google Calendar is niet verbonden.');
      return Response.json({calendars: await listCalendars(await accessToken(ctx.refresh_enc)), current: ctx.calendar_id});
    }
    throw new HttpError(404, 'Onbekende actie');
  } catch (e) { return e instanceof RevokedError ? Response.json({error: 'Google heeft de toegang ingetrokken. Verbind Google Calendar opnieuw.'}, {status: 409}) : jsonError(e); }
}

export async function POST(req: Request, {params}: {params: Promise<{action: string}>}) {
  try {
    const {action} = await params;
    const {db, user} = await authUser(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const {data: isTeacher} = await db.rpc('is_teacher');
    if (!isTeacher) throw new HttpError(403, 'Alleen docenten kunnen een agenda koppelen.');

    if (action === 'connect') return Response.json({url: authUrl(redirectOf(req), signState(user.id))});

    if (action === 'callback') {
      if (!verifyState(String(body.state || ''), user.id)) throw new HttpError(400, 'De koppeling is verlopen of hoort bij een ander account. Probeer opnieuw.');
      const t = await exchangeCode(String(body.code || ''), redirectOf(req));
      const email = await primaryEmail(t.access);
      // v52: another Google account than before → the old one is cleaned up first (its push channel stopped and its
      // access withdrawn where still possible); the database then starts this account from scratch (v52.sql)
      const old = await ctxOf(db).catch(() => null), oldEmail = old ? await db.rpc('gcal_status').then(x => (x.data as {email?: string | null} | null)?.email || null, () => null) : null;
      if (old && oldEmail !== email) {
        try { const tok = await accessToken(old.refresh_enc); await stopChannel(tok, old.channel_id, old.resource_id); } catch { /* old access already gone */ }
        await revoke(old.refresh_enc);
        const d = await db.rpc('gcal_disconnect'); if (d.error) throw new HttpError(500, d.error.message);
      }
      const {error} = await db.rpc('gcal_connect', {p_email: email, p_refresh_enc: encrypt(t.refresh)});
      if (error) throw new HttpError(500, /gcal_connect/.test(error.message) ? 'Voer eerst supabase/v45.sql uit.' : error.message);
      return Response.json({ok: true, calendars: await listCalendars(t.access)});
    }

    if (action === 'calendar') {
      const id = String(body.id || ''), name = String(body.name || '').slice(0, 200);
      const ctx = await ctxOf(db); if (!ctx) throw new HttpError(404, 'Google Calendar is niet verbonden.');
      const token = await accessToken(ctx.refresh_enc);
      const cals = await listCalendars(token);
      if (!cals.some(c => c.id === id)) throw new HttpError(400, 'Kies een agenda waarin je afspraken mag maken.');
      if (ctx.calendar_id && ctx.calendar_id !== id) await stopChannel(token, ctx.channel_id, ctx.resource_id);
      const r = await db.rpc('gcal_choose_calendar', {p_calendar: id, p_name: name || cals.find(c => c.id === id)!.name});
      if (r.error) throw new HttpError(500, r.error.message);
      return Response.json({queued: r.data, ...(await syncTeacher(db, originOf(req), webhookOf(req)))});
    }

    if (action === 'sync') {
      if (body.retry === true) await db.rpc('gcal_clear_error');
      return Response.json(await syncTeacher(db, originOf(req), webhookOf(req)));
    }

    if (action === 'settings') {
      const r = await db.rpc('gcal_set_invite', {p_on: body.invite === true});
      if (r.error) throw new HttpError(500, r.error.message);
      return Response.json(await syncTeacher(db, originOf(req), webhookOf(req)));
    }

    if (action === 'disconnect') {
      // v52: works ALSO when the Google access was already withdrawn or the token is invalid/unreadable: Google is
      // asked to stop the push channel and withdraw access where that is still possible (best effort), and the
      // connection is ALWAYS removed here: encrypted token, Google e-mail, chosen calendar, sync token, push channel,
      // lesson↔event links and pending changes. Lessons, students and appointments in TeachyRooms stay untouched.
      const ctx = await ctxOf(db).catch(() => null);
      if (ctx) {
        try { const token = await accessToken(ctx.refresh_enc); await stopChannel(token, ctx.channel_id, ctx.resource_id); } catch { /* token already invalid: Google stops the channel itself, and our webhook ignores unknown channels */ }
        await revoke(ctx.refresh_enc);
      }
      const r = await db.rpc('gcal_disconnect');
      if (r.error) throw new HttpError(500, r.error.message);
      return Response.json({ok: true});
    }
    throw new HttpError(404, 'Onbekende actie');
  } catch (e) { return e instanceof RevokedError ? Response.json({error: 'Google heeft de toegang ingetrokken. Verbind Google Calendar opnieuw.'}, {status: 409}) : jsonError(e); }
}
