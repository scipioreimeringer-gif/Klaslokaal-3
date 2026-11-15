// Tests the OpenAI integration layer with a mocked OpenAI endpoint (no real key or cost).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {chatJson, strictSchema, pricePerMTok, modelFast, modelStrong, AiError} from '../../lib/server/openai.ts';

const Schema = z.object({translation: z.string(), expression: z.string().nullable(), items: z.array(z.object({term: z.string(), kind: z.enum(['word', 'expression'])}))});
const ok = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
const reply = obj => ok({model: 'gpt-5.4-mini-2026', usage: {prompt_tokens: 120, completion_tokens: 30}, choices: [{finish_reason: 'stop', message: {content: JSON.stringify(obj), refusal: null}}]});

test('strict schema: every object has all properties required and no extra properties', () => {
  const s = strictSchema(Schema);
  assert.equal(s.additionalProperties, false);
  assert.deepEqual(s.required.sort(), ['expression', 'items', 'translation']);
  assert.equal(s.properties.items.items.additionalProperties, false);
  assert.deepEqual(s.properties.items.items.required.sort(), ['kind', 'term']);
  assert.ok(!('$schema' in s));
});

test('request format: chat completions, strict json_schema, system+user, token limit, effort; parses result and usage', async () => {
  let seen;
  const r = await chatJson({schema: Schema, name: 'translate', system: 'sys', user: 'usr', model: 'gpt-5.4-mini', effort: 'low', maxTokens: 600, apiKey: 'sk-test', baseUrl: 'http://mock/v1',
    fetchImpl: async (url, init) => { seen = {url, init, body: JSON.parse(init.body)}; return reply({translation: 'nog', expression: null, items: [{term: 'ainda', kind: 'word'}]}); }});
  assert.equal(seen.url, 'http://mock/v1/chat/completions');
  assert.equal(seen.init.headers.Authorization, 'Bearer sk-test');
  assert.equal(seen.body.response_format.type, 'json_schema');
  assert.equal(seen.body.response_format.json_schema.strict, true);
  assert.deepEqual(seen.body.messages.map(m => m.role), ['system', 'user']);
  assert.equal(seen.body.max_completion_tokens, 600);
  assert.equal(seen.body.reasoning_effort, 'low');
  assert.equal(r.data.translation, 'nog');
  assert.deepEqual([r.inputTokens, r.outputTokens, r.model], [120, 30, 'gpt-5.4-mini-2026']);
});

test('retries without reasoning_effort when the model does not support it', async () => {
  const bodies = [];
  const r = await chatJson({schema: Schema, name: 'x', system: 's', user: 'u', model: 'm', effort: 'medium', apiKey: 'k', baseUrl: 'http://mock',
    fetchImpl: async (_u, init) => { const b = JSON.parse(init.body); bodies.push(b); return b.reasoning_effort ? ok({error: {message: "Unsupported parameter: 'reasoning_effort'"}}, 400) : reply({translation: 't', expression: 'e', items: []}); }});
  assert.equal(bodies.length, 2); assert.equal(bodies[1].reasoning_effort, undefined); assert.equal(r.data.expression, 'e');
});

test('falls back to the fast model when the strong model does not exist', async () => {
  const models = [];
  const r = await chatJson({schema: Schema, name: 'x', system: 's', user: 'u', model: 'gpt-does-not-exist', fallbackModel: 'gpt-5.4-mini', apiKey: 'k', baseUrl: 'http://mock',
    fetchImpl: async (_u, init) => { const b = JSON.parse(init.body); models.push(b.model); return b.model === 'gpt-does-not-exist' ? ok({error: {message: 'The model `gpt-does-not-exist` does not exist', code: 'model_not_found'}}, 404) : reply({translation: 't', expression: null, items: []}); }});
  assert.deepEqual(models, ['gpt-does-not-exist', 'gpt-5.4-mini']); assert.equal(r.data.translation, 't');
});

test('clear errors: missing key, invalid key, rate limit, refusal, truncation, invalid JSON', async () => {
  const run = (fetchImpl, apiKey = 'k') => chatJson({schema: Schema, name: 'x', system: 's', user: 'u', model: 'm', apiKey, baseUrl: 'http://mock', fetchImpl});
  await assert.rejects(chatJson({schema: Schema, name: 'x', system: 's', user: 'u', model: 'm', apiKey: '', baseUrl: 'http://mock'}), e => e instanceof AiError && /OPENAI_API_KEY ontbreekt/.test(e.message));
  await assert.rejects(run(async () => ok({error: {message: 'bad key'}}, 401)), /ongeldig/);
  await assert.rejects(run(async () => ok({error: {message: 'quota'}}, 429)), e => e.status === 429);
  await assert.rejects(run(async () => ok({choices: [{finish_reason: 'stop', message: {content: null, refusal: 'no'}}]})), /weigerde/);
  await assert.rejects(run(async () => ok({choices: [{finish_reason: 'length', message: {content: '{"transl'}}]})), /te lang/);
  await assert.rejects(run(async () => ok({choices: [{finish_reason: 'stop', message: {content: '{"translation": 3}'}}]})), /geen geldig/);
});

test('models and prices are configurable via environment', () => {
  assert.equal(modelFast({}), 'gpt-5.4-mini');
  assert.equal(modelStrong({OPENAI_MODEL: 'a'}), 'a');
  assert.equal(modelStrong({OPENAI_MODEL: 'a', OPENAI_MODEL_STRONG: 'b'}), 'b');
  assert.deepEqual(pricePerMTok('gpt-5.4-mini-2026-03-17', {}), [0.75, 4.5]);
  assert.deepEqual(pricePerMTok('x', {OPENAI_PRICES: '{"x":[1,2]}'}), [1, 2]);
  assert.deepEqual(pricePerMTok('unknown', {}), [0, 0]);
});
