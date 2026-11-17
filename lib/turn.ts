// TURN/ICE configuration (pure, unit-tested). The servers come from the server-side environment variable
// TURN_ICE_SERVERS (e.g. the "ICE Servers Array" from the Metered dashboard, pasted as JSON) — never from the
// repository. STUN-only is the safe fallback: direct connections keep working without TURN.

export type IceServer = {urls: string | string[]; username?: string; credential?: string};
export const STUN_ONLY: IceServer[] = [{urls: 'stun:stun.l.google.com:19302'}, {urls: 'stun:stun1.l.google.com:19302'}];

/** Parse and validate the JSON of TURN_ICE_SERVERS. Invalid or empty → [] (never throws). */
export function parseIceServers(raw: string | undefined | null): IceServer[] {
  if (!raw || !raw.trim()) return [];
  let list: unknown;
  try { list = JSON.parse(raw); } catch { return []; }
  if (list && typeof list === 'object' && !Array.isArray(list) && Array.isArray((list as {iceServers?: unknown}).iceServers)) list = (list as {iceServers: unknown}).iceServers;
  if (!Array.isArray(list)) return [];
  const ok = (u: unknown) => typeof u === 'string' && /^(stun|turns?):[^\s]{3,300}$/.test(u);
  const out: IceServer[] = [];
  for (const s of list.slice(0, 12)) {
    if (!s || typeof s !== 'object') continue;
    const e = s as Record<string, unknown>;
    const urls = Array.isArray(e.urls) ? e.urls.filter(ok) as string[] : ok(e.urls) ? e.urls as string : null;
    if (!urls || (Array.isArray(urls) && !urls.length)) continue;
    const isTurn = (Array.isArray(urls) ? urls : [urls]).some(u => /^turns?:/.test(u));
    if (isTurn && (typeof e.username !== 'string' || typeof e.credential !== 'string')) continue; // TURN needs credentials
    out.push(isTurn ? {urls, username: e.username as string, credential: e.credential as string} : {urls});
  }
  return out;
}
export const hasTurn = (list: IceServer[]) => list.some(s => (Array.isArray(s.urls) ? s.urls : [s.urls]).some(u => /^turns?:/.test(u)));
