// v49: requests to our own API with a login token that is never stale.
// A phone that kept the page in the background often still holds an expired access token ("Ongeldige sessie").
// freshToken renews it when it (almost) expired; authFetch also renews once and retries when the server still says 401.
import type {SupabaseClient} from '@supabase/supabase-js';

export async function freshToken(db: SupabaseClient, force = false): Promise<string> {
  const {data} = await db.auth.getSession();
  const s = data.session;
  if (s && !force && (!s.expires_at || s.expires_at * 1000 - Date.now() > 60_000)) return s.access_token;
  if (!s && !force) return '';
  const r = await db.auth.refreshSession();
  return r.data.session?.access_token || s?.access_token || '';
}

export async function authFetch(db: SupabaseClient, path: string, init: RequestInit = {}): Promise<Response> {
  const go = (token: string) => fetch(path, {...init, headers: {...(init.headers as Record<string, string> || {}), Authorization: 'Bearer ' + token}});
  const r = await go(await freshToken(db));
  if (r.status !== 401) return r;
  const again = await freshToken(db, true); // the server rejected it: renew once and retry (no loop)
  return again ? go(again) : r;
}
