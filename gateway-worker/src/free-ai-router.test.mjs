import test from 'node:test';
import assert from 'node:assert/strict';
import { runFreeAI, FREE_AI_MODELS } from './free-ai-router.mjs';

const ok = (payload) => ({ ok: true, status: 200, json: async () => payload });
const fail = (status) => ({ ok: false, status, json: async () => ({ error: 'unavailable' }) });
const ovhUrl = 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions';

test('uses only OpenRouter free model route and normalizes its answer', async () => {
  let request;
  const result = await runFreeAI({
    env: { OPENROUTER_API_KEY: 'test-key' },
    messages: [{ role: 'user', content: 'hello' }],
    fetchImpl: async (url, init) => {
      request = { url, body: JSON.parse(init.body) };
      return ok({ choices: [{ message: { content: 'hello back' } }] });
    },
  });
  assert.equal(request.body.model, 'openrouter/free');
  assert.equal(result.text, 'hello back');
  assert.equal(result.provider, 'openrouter');
});

test('falls back to Gemini only when no-billing attestation and key are present', async () => {
  const calls = [];
  const result = await runFreeAI({
    env: { OPENROUTER_API_KEY: 'or-key', GEMINI_API_KEY: 'gm-key', GEMINI_FREE_TIER_NO_BILLING: 'true' },
    messages: [{ role: 'user', content: 'test' }],
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (calls.length === 1) return fail(429);
      return ok({ candidates: [{ content: { parts: [{ text: 'gemini answer' }] } }] });
    },
  });
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /gemini-3\.1-flash-lite:generateContent/);
  assert.equal(result.provider, 'gemini');
  assert.equal(result.text, 'gemini answer');
});

test('does not call Gemini without explicit no-billing attestation', async () => {
  const calls = [];
  const result = await runFreeAI({
    env: { GEMINI_API_KEY: 'gm-key' },
    messages: [{ role: 'user', content: 'test' }],
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return ok({ choices: [{ message: { content: 'OVH answer' } }] });
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ovhUrl);
  assert.equal(result.provider, 'ovh-anonymous');
});

test('uses OVH anonymous endpoint when no provider keys are configured', async () => {
  let request;
  const result = await runFreeAI({
    env: {},
    messages: [{ role: 'user', content: 'test' }],
    fetchImpl: async (url, init) => {
      request = { url, init };
      return ok({ choices: [{ message: { content: 'anonymous answer' } }] });
    },
  });
  assert.equal(request.url, ovhUrl);
  assert.equal(request.init.headers.authorization, undefined);
  assert.equal(JSON.parse(request.init.body).model, 'gpt-oss-20b');
  assert.equal(result.provider, 'ovh-anonymous');
  assert.equal(result.text, 'anonymous answer');
});

test('fails closed when every configured free provider is unavailable', async () => {
  const calls = [];
  await assert.rejects(() => runFreeAI({
    env: { OPENROUTER_API_KEY: 'or-key' },
    messages: [{ role: 'user', content: 'test' }],
    fetchImpl: async (url) => { calls.push(url); return fail(402); },
  }), { code: 'free_ai_unavailable' });
  assert.deepEqual(calls, [
    'https://openrouter.ai/api/v1/chat/completions',
    ovhUrl,
  ]);
});

test('exports all pinned free route model IDs', () => {
  assert.deepEqual(FREE_AI_MODELS, {
    openrouter: 'openrouter/free',
    gemini: 'gemini-3.1-flash-lite',
    ovh: 'gpt-oss-20b',
  });
});
