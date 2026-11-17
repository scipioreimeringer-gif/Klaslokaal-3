// Server-only AI helpers. Never import from client components.
// All AI runs on OpenAI (one key: OPENAI_API_KEY): text tasks via Chat Completions with
// strict JSON-schema output, speech-to-text via the transcription endpoint.
// Every route authenticates with the user's own Supabase session, so RLS decides access.
import 'server-only';
import {createClient, type SupabaseClient, type User} from '@supabase/supabase-js';
import type {z} from 'zod';
import {AiError, chatJson, modelFast, modelStrong, pricePerMTok} from './openai';

export const MODEL_FAST = modelFast();
export const MODEL_STRONG = modelStrong();

export class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }

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
  const status = e instanceof HttpError || e instanceof AiError ? e.status : 500;
  const message = e instanceof Error ? e.message : 'Onbekende fout';
  return Response.json({error: message}, {status});
}

type AskOpts = {maxTokens?: number; effort?: 'low' | 'medium' | 'high'; log?: UsageCtx};
async function ask<S extends z.ZodType>(model: string, schema: S, system: string, user: string, opts: AskOpts): Promise<z.infer<S>> {
  const r = await chatJson({schema, name: (opts.log?.kind || 'result') + '_output', system, user, model, fallbackModel: modelFast(), maxTokens: opts.maxTokens, effort: opts.effort});
  if (opts.log) await logUsage(opts.log, r.model, r.inputTokens, r.outputTokens);
  return r.data;
}
/** Fast tasks: translation, exercises, lesson preparation (OPENAI_MODEL). */
export const askFast = <S extends z.ZodType>(schema: S, system: string, user: string, opts: AskOpts = {}) => ask(modelFast(), schema, system, user, {effort: 'low', ...opts});
/** Quality-critical tasks: lesson analysis, canvas restructuring (OPENAI_MODEL_STRONG, falls back to OPENAI_MODEL). */
export const askStrong = <S extends z.ZodType>(schema: S, system: string, user: string, opts: AskOpts = {}) => ask(modelStrong(), schema, system, user, {effort: 'medium', maxTokens: 16000, ...opts});
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
  const r = await fetch((process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '') + '/audio/transcriptions', {method: 'POST', headers: {Authorization: `Bearer ${process.env.OPENAI_API_KEY}`}, body: form});
  const j = await r.json().catch(() => ({})) as {text?: string; duration?: number; segments?: {start: number; end: number; text: string}[]; error?: {message?: string}};
  if (!r.ok) return none('Transcriptie mislukt: ' + (j.error?.message || r.status));
  const duration = Math.round(Number(j.duration) || 0);
  if (log) await logUsage(log, process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1', 0, 0, duration);
  return {text: String(j.text || '').trim(), segments: (j.segments || []).map(s => ({start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || '')})), duration};
}

/* ---------------- usage log, cost estimate and fair-use limits ---------------- */
export type UsageKind = 'translate' | 'tidy' | 'analysis' | 'transcription' | 'exercises' | 'prepare' | 'assistant' | 'vocab' | 'games';
export type UsageCtx = {db: SupabaseClient; userId: string; kind: UsageKind; studentId?: string | null; cached?: boolean};
/** Audio price per minute (OpenAI whisper-1; override via env). Token prices: see pricePerMTok in ./openai. */
const AUDIO_USD_PER_MIN = () => Number(process.env.OPENAI_TRANSCRIBE_USD_PER_MIN || '0.006');
export function estimateCost(model: string, input: number, output: number, audioSeconds = 0) {
  const p = pricePerMTok(model);
  return (input * p[0] + output * p[1]) / 1e6 + (audioSeconds / 60) * (audioSeconds ? AUDIO_USD_PER_MIN() : 0);
}
async function logUsage(ctx: UsageCtx, model: string, input: number, output: number, audioSeconds = 0) {
  const kind: UsageKind = audioSeconds ? 'transcription' : ctx.kind;
  await ctx.db.from('ai_usage').insert({user_id: ctx.userId, student_id: ctx.studentId || null, kind, model, input_tokens: input, output_tokens: output, audio_seconds: audioSeconds, cost_usd: Number(estimateCost(model, input, output, audioSeconds).toFixed(5)), cached: !!ctx.cached});
}
/** Daily limits per user (non-cached calls). Configurable via env AI_DAILY_LIMITS='{"translate":400}'. */
const DEFAULT_LIMITS: Record<UsageKind, number> = {translate: 400, tidy: 30, analysis: 15, transcription: 40, exercises: 40, prepare: 30, assistant: 60, vocab: 60, games: 60};
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
/** Interface language for explanations/instructions: the one sent by the client, else the user's profile setting, else Dutch.
 *  (Separate from the language being learned; exercises themselves stay in that language.) */
export async function uiLanguage(db: SupabaseClient, userId: string, requested?: unknown): Promise<string> {
  if (typeof requested === 'string' && /^(nl|en|pt|es|fr|de)$/.test(requested)) return requested;
  const {data} = await db.from('profiles').select('preferred_language').eq('id', userId).maybeSingle();
  const p = (data as {preferred_language?: string} | null)?.preferred_language;
  return p && /^(nl|en|pt|es|fr|de)$/.test(p) ? p : 'nl';
}
