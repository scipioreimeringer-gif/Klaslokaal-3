// TURN/ICE configuration (pure, unit-tested). The servers come from the server-side environment variable
// TURN_ICE_SERVERS (the "ICE Servers Array" from the Metered dashboard) — never from the repository.
// Accepted: strict JSON, or the JavaScript notation Metered shows (unquoted keys, single quotes, trailing
// commas, optional "const iceServers =" / "iceServers:" prefix and ";"). Nothing is ever evaluated as code.
// STUN-only is the safe fallback: direct connections keep working without TURN.

export type IceServer = {urls: string | string[]; username?: string; credential?: string};
export type IceStatus = 'ok' | 'missing' | 'invalid' | 'no_turn';
export const STUN_ONLY: IceServer[] = [{urls: 'stun:stun.l.google.com:19302'}, {urls: 'stun:stun1.l.google.com:19302'}];

/** JavaScript-style array/object literal → JSON text (no eval). Strings are kept intact. */
export function relaxedToJson(raw: string): string {
  let s = raw.trim().replace(/^(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*/, '').replace(/;\s*$/, '');
  s = s.replace(/^\s*iceServers\s*:\s*/, '');
  let out = '', i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '"' || ch === "'") { // copy a string literal, normalised to double quotes
      let j = i + 1, body = '';
      while (j < s.length && s[j] !== ch) { if (s[j] === '\\' && j + 1 < s.length) { body += s[j] + s[j + 1]; j += 2; continue; } body += s[j]; j++; }
      out += '"' + (ch === "'" ? body.replace(/\\'/g, "'").replace(/"/g, '\\"') : body) + '"'; i = j + 1; continue;
    }
    if (/[A-Za-z_$]/.test(ch) && /[{,]\s*$/.test(out)) { // unquoted key
      let j = i; while (j < s.length && /[\w$]/.test(s[j])) j++;
      const rest = s.slice(j).match(/^\s*:/);
      if (rest) { out += '"' + s.slice(i, j) + '"'; i = j; continue; }
    }
    out += ch; i++;
  }
  return out.replace(/,\s*([\]}])/g, '$1');
}

/** Parse and validate TURN_ICE_SERVERS. Never throws. */
export function readIceServers(raw: string | undefined | null): {servers: IceServer[]; status: IceStatus} {
  if (!raw || !raw.trim()) return {servers: [], status: 'missing'};
  let list: unknown;
  try { list = JSON.parse(raw); } catch { try { list = JSON.parse(relaxedToJson(raw)); } catch { return {servers: [], status: 'invalid'}; } }
  if (list && typeof list === 'object' && !Array.isArray(list) && Array.isArray((list as {iceServers?: unknown}).iceServers)) list = (list as {iceServers: unknown}).iceServers;
  if (!Array.isArray(list)) return {servers: [], status: 'invalid'};
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
  if (!out.length) return {servers: [], status: 'invalid'};
  return {servers: out, status: hasTurn(out) ? 'ok' : 'no_turn'};
}
export const parseIceServers = (raw: string | undefined | null) => readIceServers(raw).servers;
export const hasTurn = (list: IceServer[]) => list.some(s => (Array.isArray(s.urls) ? s.urls : [s.urls]).some(u => /^turns?:/.test(u)));
