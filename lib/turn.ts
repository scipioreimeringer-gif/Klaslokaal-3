// TURN/ICE configuration (pure, unit-tested). The servers come from the server-side environment variable
// TURN_ICE_SERVERS (the "ICE Servers Array" from the Metered dashboard) — never from the repository.
// Accepted: strict JSON, or the JavaScript notation Metered shows (unquoted keys, single quotes, trailing
// commas, optional "const iceServers =" / "iceServers:" prefix and ";"). Nothing is ever evaluated as code.
// STUN-only is the safe fallback: direct connections keep working without TURN.

export type IceServer = {urls: string | string[]; username?: string; credential?: string};
/** Why there is (no) TURN. Never contains (part of) the value itself. */
export type IceStatus = 'ok' | 'missing' | 'invalid' | 'invalid_parse' | 'invalid_entries' | 'turn_without_credentials' | 'no_turn';
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

// Walk the text outside string literals and drop line comments and block comments.
function stripComments(raw: string): string {
  let out = '', i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '"' || ch === "'" || ch === '`') { let j = i + 1; while (j < raw.length && raw[j] !== ch) j += raw[j] === '\\' ? 2 : 1; out += raw.slice(i, j + 1); i = j + 1; continue; }
    if (ch === '/' && raw[i + 1] === '/') { while (i < raw.length && raw[i] !== '\n') i++; continue; }
    if (ch === '/' && raw[i + 1] === '*') { const e = raw.indexOf('*/', i + 2); i = e < 0 ? raw.length : e + 2; continue; }
    out += ch; i++;
  }
  return out;
}
/** The array after "iceServers" (or the first array) in a code snippet such as
 *  new RTCPeerConnection({ iceServers: [ ... ] }) — brackets matched, strings respected. */
function extractArray(text: string): string | null {
  const key = text.search(/iceServers\s*[:=]/);
  let start = text.indexOf('[', key < 0 ? 0 : key);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') { let j = i + 1; while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1; i = j; continue; }
    if (ch === '[') depth++; else if (ch === ']' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}
function parseLoose(raw: string): unknown {
  const tries = [() => JSON.parse(raw), () => JSON.parse(relaxedToJson(raw)), () => { const a = extractArray(stripComments(raw)); if (!a) throw new Error('none'); return JSON.parse(relaxedToJson(a)); }];
  for (const t of tries) { try { let v = t(); if (typeof v === 'string') v = parseLoose(v); return v; } catch { /* next */ } }
  return undefined;
}
/** Parse and validate TURN_ICE_SERVERS. Never throws. */
export function readIceServers(raw: string | undefined | null): {servers: IceServer[]; status: IceStatus} {
  if (!raw || !raw.trim()) return {servers: [], status: 'missing'};
  let list = parseLoose(raw.trim());
  if (list === undefined) return {servers: [], status: 'invalid_parse'};
  if (list && typeof list === 'object' && !Array.isArray(list) && Array.isArray((list as {iceServers?: unknown}).iceServers)) list = (list as {iceServers: unknown}).iceServers;
  if (!Array.isArray(list)) return {servers: [], status: 'invalid_parse'};
  let turnWithoutCreds = 0;
  const ok = (u: unknown) => typeof u === 'string' && /^(stun|turns?):[^\s]{3,300}$/.test(u);
  const out: IceServer[] = [];
  for (const s of list.slice(0, 12)) {
    if (!s || typeof s !== 'object') continue;
    const e = s as Record<string, unknown>;
    const urls = Array.isArray(e.urls) ? e.urls.filter(ok) as string[] : ok(e.urls) ? e.urls as string : null;
    if (!urls || (Array.isArray(urls) && !urls.length)) continue;
    const isTurn = (Array.isArray(urls) ? urls : [urls]).some(u => /^turns?:/.test(u));
    if (isTurn && (typeof e.username !== 'string' || typeof e.credential !== 'string')) { turnWithoutCreds++; continue; } // TURN needs credentials
    out.push(isTurn ? {urls, username: e.username as string, credential: e.credential as string} : {urls});
  }
  if (!out.length) return {servers: [], status: turnWithoutCreds ? 'turn_without_credentials' : 'invalid_entries'};
  return {servers: out, status: hasTurn(out) ? 'ok' : turnWithoutCreds ? 'turn_without_credentials' : 'no_turn'};
}
export const parseIceServers = (raw: string | undefined | null) => readIceServers(raw).servers;
export const hasTurn = (list: IceServer[]) => list.some(s => (Array.isArray(s.urls) ? s.urls : [s.urls]).some(u => /^turns?:/.test(u)));
