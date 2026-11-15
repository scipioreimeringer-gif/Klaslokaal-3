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
export async function askFast<S extends z.ZodType>(schema: S, system: string, user: string, opts: {maxTokens?: number; effort?: 'low' | 'medium' | 'high'; log?: UsageCtx} = {}): Promise<z.infer<S>> {
  const res = await claude().messages.parse({
    model: MODEL_FAST,
    max_tokens: opts.maxTokens ?? 4000,
    system,
    output_config: {effort: opts.effort ?? 'low', format: zodOutputFormat(schema)},
    messages: [{role: 'user', content: user}],
  });
  if (opts.log) await logUsage(opts.log, MODEL_FAST, res.usage.input_tokens, res.usage.output_tokens);
  if (res.stop_reason === 'refusal') throw new HttpError(422, 'De AI weigerde dit verzoek');
  if (res.stop_reason === 'max_tokens') throw new HttpError(502, 'AI-antwoord was te lang en is afgebroken');
  if (!res.parsed_output) throw new HttpError(502, 'AI gaf geen geldig antwoord');
  return res.parsed_output as z.infer<S>;
}

/** Opus 5.5 with server-side refusal fallback (routes to a suitable model if Opus declines). */
export async function askStrong<S extends z.ZodType>(schema: S, system: string, user: string, opts: {maxTokens?: number; effort?: 'low' | 'medium' | 'high'; log?: UsageCtx} = {}): Promise<z.infer<S>> {
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
  if (opts.log) await logUsage(opts.log, res.model || MODEL_STRONG, res.usage.input_tokens, res.usage.output_tokens);
  if (res.stop_reason === 'refusal') throw new HttpError(422, 'De AI weigerde dit verzoek');
  if (res.stop_reason === 'max_tokens') throw new HttpError(502, 'AI-antwoord was te lang en is afgebroken');
  const text = res.content.filter(b => b.type === 'text').map(b => (b as {text: string}).text).join('');
  const parsed = schema.safeParse(safeJson(text));
  if (!parsed.success) throw new HttpError(502, 'AI gaf geen geldig antwoord');
  return parsed.data as z.infer<S>;
}
function safeJson(t: string) { try { return JSON.parse(t); } catch { return null; } }

/** Speech-to-text via OpenAI, with timestamped segments (used to merge per-speaker tracks). */
export async function transcribe(audio: Blob, filename: string, languageHint?: string, log?: UsageCtx): Promise<{text: string | null; segments: {start: number; end: number; text: string}[]; duration: number; reason?: string}> {
  const none = (reason: string) => ({text: null, segments: [], duration: 0, reason});
  if (!process.env.OPENAI_API_KEY) return none('Transcriptie niet beschikbaar: OPENAI_API_KEY ontbreekt in Vercel');
  if (audio.size > 25 * 1024 * 1024) return none('Opname is groter dan 25 MB; transcriptie overgeslagen');
  const form = new FormData();
  form.append('file', audio, filename);
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1');
  form.append('response_format', 'verbose_json');
  if (languageHint && /^[a-z]{2}$/.test(languageHint)) form.append('language', languageHint);
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {method: 'POST', headers: {Authorization: `Bearer ${process.env.OPENAI_API_KEY}`}, body: form});
  const j = await r.json().catch(() => ({})) as {text?: string; duration?: number; segments?: {start: number; end: number; text: string}[]; error?: {message?: string}};
  if (!r.ok) return none('Transcriptie mislukt: ' + (j.error?.message || r.status));
  const duration = Math.round(Number(j.duration) || 0);
  if (log) await logUsage(log, process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1', 0, 0, duration);
  return {text: String(j.text || '').trim(), segments: (j.segments || []).map(s => ({start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || '')})), duration};
}

/* ---------------- usage log, cost estimate and fair-use limits ---------------- */
export type UsageKind = 'translate' | 'tidy' | 'analysis' | 'transcription' | 'exercises' | 'prepare' | 'assistant';
export type UsageCtx = {db: SupabaseClient; userId: string; kind: UsageKind; studentId?: string | null; cached?: boolean};
/** USD per million tokens (Anthropic list prices, Nov 2026) and per audio minute (OpenAI; override via env). */
const PRICE: Record<string, [number, number]> = {'claude-haiku-5-5': [0.10, 0.50], 'claude-opus-5-5': [4, 20]};
const AUDIO_USD_PER_MIN = () => Number(process.env.OPENAI_TRANSCRIBE_USD_PER_MIN || '0.006');
export function estimateCost(model: string, input: number, output: number, audioSeconds = 0) {
  const p = PRICE[model] || PRICE[MODEL_STRONG];
  return (input * p[0] + output * p[1]) / 1e6 + (audioSeconds / 60) * (audioSeconds ? AUDIO_USD_PER_MIN() : 0);
}
async function logUsage(ctx: UsageCtx, model: string, input: number, output: number, audioSeconds = 0) {
  const kind: UsageKind = audioSeconds ? 'transcription' : ctx.kind;
  await ctx.db.from('ai_usage').insert({user_id: ctx.userId, student_id: ctx.studentId || null, kind, model, input_tokens: input, output_tokens: output, audio_seconds: audioSeconds, cost_usd: Number(estimateCost(model, input, output, audioSeconds).toFixed(5)), cached: !!ctx.cached});
}
/** Daily limits per user (non-cached calls). Configurable via env AI_DAILY_LIMITS='{"translate":400}'. */
const DEFAULT_LIMITS: Record<UsageKind, number> = {translate: 400, tidy: 30, analysis: 15, transcription: 40, exercises: 40, prepare: 30, assistant: 60};
export async function enforceLimit(db: SupabaseClient, userId: string, kind: UsageKind) {
  let limits = DEFAULT_LIMITS;
  try { limits = {...DEFAULT_LIMITS, ...JSON.parse(process.env.AI_DAILY_LIMITS || '{}')}; } catch { /* keep defaults */ }
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const {count, error} = await db.from('ai_usage').select('id', {count: 'exact', head: true}).eq('user_id', userId).eq('kind', kind).eq('cached', false).gte('created_at', since);
  if (error) return; // v28 not installed yet: no limit bookkeeping possible
  if ((count || 0) >= limits[kind]) throw new HttpError(429, `Daglimiet bereikt voor deze AI-functie (${limits[kind]} per 24 uur). Probeer het later opnieuw.`);
}
export const LANG_NAMES: Record<string, string> = {nl: 'Dutch', pt: 'Brazilian Portuguese', en: 'English', es: 'Spanish', fr: 'French', de: 'German'};
export const langName = (code: string | null | undefined) => LANG_NAMES[code || ''] || 'Dutch';
