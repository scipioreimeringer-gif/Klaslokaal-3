// v74: pure part of the per-account classroom settings (unit-tested). Every key is per role (-t teacher / -s student).
const ROLE_KEYS = ['klas-camset', 'klas-cam', 'klas-lay72', 'klas-self', 'klas-pip-auto', 'klas-react']; // v77: reaction favourites
export const PREF_KEYS = ROLE_KEYS.flatMap(k => [k + '-t', k + '-s']);
/** Which saved values to write locally (only when the account copy is at least as new as this device's). */
export function prefsToApply(saved: {at?: number; values?: Record<string, unknown>} | null | undefined, localAt: number): Record<string, string> {
  if (!saved?.values || !(Number(saved.at) >= localAt)) return {};
  const out: Record<string, string> = {}; for (const k of PREF_KEYS) if (k in saved.values) out[k] = JSON.stringify(saved.values[k]); return out;
}
