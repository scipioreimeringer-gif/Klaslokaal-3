// OpenAI client for all text AI tasks (Chat Completions + strict JSON-schema output).
// No 'server-only' import here so it can be unit-tested; only lib/server/ai.ts imports it.
import {z} from 'zod';

export class AiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }

/** Fast model for translations, exercises, preparation; strong model for analysis and tidying. */
export const modelFast = (env: Record<string, string | undefined> = process.env) => env.OPENAI_MODEL || 'gpt-5.4-mini';
export const modelStrong = (env: Record<string, string | undefined> = process.env) => env.OPENAI_MODEL_STRONG || modelFast(env);

/**
 * OpenAI strict structured outputs require every object to list all properties in
 * `required` and to set additionalProperties:false. Optional values are expressed as nullable.
 */
export function strictSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, {target: 'draft-7'}) as Record<string, unknown>;
  const fix = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(fix);
    if (!node || typeof node !== 'object') return node;
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) if (k !== '$schema') o[k] = fix(v);
    if (o.type === 'object' && o.properties && typeof o.properties === 'object') {
      o.required = Object.keys(o.properties as object);
      o.additionalProperties = false;
    }
    return o;
  };
  return fix(raw) as Record<string, unknown>;
}

export type ChatResult<T> = {data: T; model: string; inputTokens: number; outputTokens: number};
type Fetch = typeof fetch;

/**
 * One structured call. Retries once without `reasoning_effort` if the model does not support it,
 * and once on the fast model if the configured model does not exist.
 */
export async function chatJson<S extends z.ZodType>(opts: {
  schema: S; name: string; system: string; user: string; model: string; fallbackModel?: string;
  maxTokens?: number; effort?: 'low' | 'medium' | 'high'; apiKey?: string; baseUrl?: string; fetchImpl?: Fetch;
}): Promise<ChatResult<z.infer<S>>> {
  const key = opts.apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) throw new AiError(503, 'AI staat nog niet aan: OPENAI_API_KEY ontbreekt in Vercel');
  const base = (opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const f = opts.fetchImpl ?? fetch;
  const format = {type: 'json_schema', json_schema: {name: opts.name, strict: true, schema: strictSchema(opts.schema)}};
  const call = async (model: string, withEffort: boolean): Promise<Response> => f(`${base}/chat/completions`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      model,
      messages: [{role: 'system', content: opts.system}, {role: 'user', content: opts.user}],
      response_format: format,
      max_completion_tokens: opts.maxTokens ?? 8000,
      ...(withEffort && opts.effort ? {reasoning_effort: opts.effort} : {}),
    }),
  });
  let model = opts.model, withEffort = true;
  let r = await call(model, withEffort);
  for (let attempt = 0; attempt < 2 && !r.ok; attempt++) {
    const text = await r.clone().text();
    if (r.status === 400 && /reasoning_effort/i.test(text) && withEffort) { withEffort = false; r = await call(model, withEffort); continue; }
    if ((r.status === 404 || /model_not_found|does not exist/i.test(text)) && opts.fallbackModel && model !== opts.fallbackModel) { model = opts.fallbackModel; r = await call(model, withEffort); continue; }
    break;
  }
  const j = await r.json().catch(() => ({})) as {
    error?: {message?: string}; model?: string; usage?: {prompt_tokens?: number; completion_tokens?: number};
    choices?: {finish_reason?: string; message?: {content?: string | null; refusal?: string | null}}[];
  };
  if (!r.ok) {
    const status = r.status === 401 ? 503 : r.status === 429 ? 429 : 502;
    throw new AiError(status, r.status === 401 ? 'OPENAI_API_KEY is ongeldig' : r.status === 429 ? 'AI is even druk of het tegoed is op; probeer het later opnieuw' : `AI-fout: ${j.error?.message || r.status}`);
  }
  const choice = j.choices?.[0];
  if (choice?.message?.refusal) throw new AiError(422, 'De AI weigerde dit verzoek');
  if (choice?.finish_reason === 'length') throw new AiError(502, 'AI-antwoord was te lang en is afgebroken');
  let parsed: unknown = null;
  try { parsed = JSON.parse(choice?.message?.content || ''); } catch { /* handled below */ }
  const v = opts.schema.safeParse(parsed);
  if (!v.success) throw new AiError(502, 'AI gaf geen geldig antwoord');
  return {data: v.data as z.infer<S>, model: j.model || model, inputTokens: j.usage?.prompt_tokens || 0, outputTokens: j.usage?.completion_tokens || 0};
}

/** USD per 1M tokens. Defaults for gpt-5.4-mini; override with OPENAI_PRICES='{"model":[in,out]}'. */
export function pricePerMTok(model: string, env: Record<string, string | undefined> = process.env): [number, number] {
  const defaults: Record<string, [number, number]> = {'gpt-5.4-mini': [0.75, 4.5]};
  let custom: Record<string, [number, number]> = {};
  try { custom = JSON.parse(env.OPENAI_PRICES || '{}'); } catch { /* ignore */ }
  const all = {...defaults, ...custom};
  const hit = Object.keys(all).find(k => model === k || model.startsWith(k + '-'));
  return hit ? all[hit] : [0, 0]; // unknown price → logged as 0, tokens are still recorded
}
