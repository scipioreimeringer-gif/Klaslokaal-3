// Server-only AI helpers. Never import from client components.
// - Claude (Anthropic SDK) for language tasks, with schema-validated JSON output.
// - OpenAI only for speech-to-text (Anthropic does not offer transcription).
// - Every route authenticates with the user's own Supabase session, so RLS decides access.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import {zodOutputFormat} from '@anthropic-ai/sdk/helpers/zod';
import {betaZodOutputFormat} from '@anthropic-ai/sdk/helpers/beta/zod';
import {createClient, type SupabaseClient, type User} from '@supabase/supabase-js';
import type {z} from 'zod';

/** Fast, inexpensive tasks (translation, exercises). */
export const MODEL_FAST = 'claude-haiku-5-5';
/** Quality-critical tasks (lesson analysis, canvas restructuring). */
export const MODEL_STRONG = 'claude-opus-5-5';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function authUser(req: Request): Promise<{db: SupabaseClient; user: User; token: string}> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new HttpError(500, 'Supabase-configuratie ontbreekt');
  if (!token) throw new HttpError(401, 'Log eerst in');
  const db = createClient(url, key, {global: {headers: {Authorization: `Bearer ${token}`}}, auth: {persistSession: false, autoRefreshToken: false}});
  const {data: {user}, error} = await db.auth.getUser(token);
  if (error || !user) throw new HttpError(401, 'Ongeldige sessie, log opnieuw in');
  return {db, user, token};
}

export function jsonError(e: unknown) {
  const status = e instanceof HttpError ? e.status : e instanceof Anthropic.RateLimitError ? 429 : e instanceof Anthropic.APIError ? 502 : 500;
  const message = e instanceof HttpError ? e.message
    : e instanceof Anthropic.AuthenticationError ? 'ANTHROPIC_API_KEY is ongeldig'
    : e instanceof Anthropic.RateLimitError ? 'AI is even druk, probeer het zo opnieuw'
    : e instanceof Anthropic.APIError ? `AI-fout (${e.status})`
    : e instanceof Error ? e.message : 'Onbekende fout';
  return Response.json({error: message}, {status});
}

let client: Anthropic | null = null;
function claude() {
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, 'AI staat nog niet aan: zet ANTHROPIC_API_KEY in Vercel');
  return (client ??= new Anthropic());
}

/** Haiku 5.5: schema-validated JSON. */
export async function askFast<S extends z.ZodType>(schema: S, system: string, user: string, opts: {maxTokens?: number; effort?: 'low' | 'medium' | 'high'} = {}): Promise<z.infer<S>> {
  const res = await claude().messages.parse({
    model: MODEL_FAST,
    max_tokens: opts.maxTokens ?? 4000,
    system,
    output_config: {effort: opts.effort ?? 'low', format: zodOutputFormat(schema)},
    messages: [{role: 'user', content: user}],
  });
  if (res.stop_reason === 'refusal') throw new HttpError(422, 'De AI weigerde dit verzoek');
  if (res.stop_reason === 'max_tokens') throw new HttpError(502, 'AI-antwoord was te lang en is afgebroken');
  if (!res.parsed_output) throw new HttpError(502, 'AI gaf geen geldig antwoord');
  return res.parsed_output as z.infer<S>;
}

/** Opus 5.5 with server-side refusal fallback (routes to a suitable model if Opus declines). */
export async function askStrong<S extends z.ZodType>(schema: S, system: string, user: string, opts: {maxTokens?: number; effort?: 'low' | 'medium' | 'high'} = {}): Promise<z.infer<S>> {
  const stream = claude().beta.messages.stream({
    model: MODEL_STRONG,
    max_tokens: opts.maxTokens ?? 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    output_config: {effort: opts.effort ?? 'medium', format: betaZodOutputFormat(schema)},
    messages: [{role: 'user', content: user}],
  });
  const res = await stream.finalMessage();
  if (res.stop_reason === 'refusal') throw new HttpError(422, 'De AI weigerde dit verzoek');
  if (res.stop_reason === 'max_tokens') throw new HttpError(502, 'AI-antwoord was te lang en is afgebroken');
  const text = res.content.filter(b => b.type === 'text').map(b => (b as {text: string}).text).join('');
  const parsed = schema.safeParse(safeJson(text));
  if (!parsed.success) throw new HttpError(502, 'AI gaf geen geldig antwoord');
  return parsed.data as z.infer<S>;
}
function safeJson(t: string) { try { return JSON.parse(t); } catch { return null; } }

/** Speech-to-text via OpenAI. Returns null text with a reason when unavailable. */
export async function transcribe(audio: Blob, filename: string, languageHint?: string): Promise<{text: string | null; reason?: string}> {
  if (!process.env.OPENAI_API_KEY) return {text: null, reason: 'Transcriptie niet beschikbaar: OPENAI_API_KEY ontbreekt in Vercel'};
  if (audio.size > 25 * 1024 * 1024) return {text: null, reason: 'Opname is groter dan 25 MB; transcriptie overgeslagen'};
  const form = new FormData();
  form.append('file', audio, filename);
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1');
  if (languageHint && /^[a-z]{2}$/.test(languageHint)) form.append('language', languageHint);
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {method: 'POST', headers: {Authorization: `Bearer ${process.env.OPENAI_API_KEY}`}, body: form});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return {text: null, reason: 'Transcriptie mislukt: ' + ((j as {error?: {message?: string}}).error?.message || r.status)};
  return {text: String((j as {text?: string}).text || '').trim()};
}

export const LANG_NAMES: Record<string, string> = {nl: 'Dutch', pt: 'Brazilian Portuguese', en: 'English', es: 'Spanish', fr: 'French', de: 'German'};
export const langName = (code: string | null | undefined) => LANG_NAMES[code || ''] || 'Dutch';
