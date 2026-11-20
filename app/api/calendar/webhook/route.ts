// v45: Google Calendar push notifications. Google only says "something changed" for a channel; we then read the
// changes ourselves (incremental sync). The channel is checked with its secret token (stored only as a SHA-256 hash).
import {accessToken, anonDb, gcalConfigured, pullChanges, RevokedError, sha256} from '../../../../lib/server/gcal';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const channel = req.headers.get('x-goog-channel-id') || '', token = req.headers.get('x-goog-channel-token') || '', state = req.headers.get('x-goog-resource-state') || '';
  if (!channel || !token || !gcalConfigured()) return new Response(null, {status: 204});
  if (state === 'sync') return new Response(null, {status: 200});                       // handshake when the channel starts
  const db = anonDb(), hash = sha256(token);
  const {data} = await db.rpc('gcal_webhook_context', {p_channel: channel, p_token_hash: hash});
  const ctx = data as {refresh_enc: string; calendar_id: string | null; sync_token: string | null} | null;
  if (!ctx?.calendar_id) return new Response(null, {status: 204});                       // unknown / old channel: ignore quietly
  try {
    const pulled = await pullChanges(await accessToken(ctx.refresh_enc), ctx.calendar_id, ctx.sync_token);
    await db.rpc('gcal_webhook_apply', {p_channel: channel, p_token_hash: hash, p_events: pulled.events, p_sync_token: pulled.syncToken, p_error: null});
  } catch (e) {
    // A missed or failed notification is recovered by the next sync (agenda opened, lesson saved or "Opnieuw synchroniseren").
    await db.rpc('gcal_webhook_apply', {p_channel: channel, p_token_hash: hash, p_events: [], p_sync_token: null, p_error: e instanceof RevokedError ? 'revoked' : 'Synchronisatie via Google-melding mislukt; probeer opnieuw te synchroniseren.'});
  }
  return new Response(null, {status: 200});
}
