/**
 * OpenAI-compatible client for N3mak.
 * Provider priority: explicitly enabled internal Free AI gateway, then
 * explicitly enabled OVHcloud anonymous endpoint, then configured legacy route.
 * Free routes fail closed and never fall back to a paid/legacy provider.
 */
const BASE = (process.env.OPENAI_BASE_URL || '').replace(/\\/$/, '');
const KEY = process.env.OPENAI_API_KEY || 'n3mak-local';
const MODEL = process.env.OPENAI_MODEL || 'cfp/openai/gpt-oss-20b';
const FREE_BASE = (process.env.N3MAK_FREE_AI_BASE_URL || '').replace(/\\/$/, '');
const FREE_KEY = process.env.N3MAK_FREE_AI_TOKEN || '';
const FREE_ENABLED = process.env.N3MAK_FREE_AI_ENABLED === 'true' && Boolean(FREE_BASE && FREE_KEY);

// OVHcloud publishes model-specific OpenAI-compatible endpoints. Anonymous
// access requires no key; the provider documents a limit of 2 requests/minute
// per IP and model. Keep this opt-in and never attach a placeholder Bearer key.
const OVH_BASE = (process.env.N3MAK_OVH_ANON_BASE_URL ||
  'https://gpt-oss-20b.endpoints.kepler.ai.cloud.ovh.net/api/openai_compat').replace(/\\/$/, '');
const OVH_MODEL = process.env.N3MAK_OVH_ANON_MODEL || 'gpt-oss-20b';
const OVH_ENABLED = process.env.N3MAK_OVH_ANON_ENABLED === 'true';

function isEnabled() {
  return FREE_ENABLED || OVH_ENABLED || Boolean(BASE);
}

async function requestChat(url, messages, max_tokens, headers, model) {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, max_tokens }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error?.message || `AI provider HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body.choices?.[0]?.message?.content ?? '';
}

async function chat(messages, { model = MODEL, max_tokens = 256, task } = {}) {
  if (FREE_ENABLED) {
    return requestChat(
      `${FREE_BASE}/chat/completions`,
      messages,
      max_tokens,
      { 'Content-Type': 'application/json', Authorization: `Bearer ${FREE_KEY}` },
      'n3mak/free',
    );
  }

  if (OVH_ENABLED) {
    // Deliberately omit Authorization: OVH anonymous access rejects no-key
    // calls if a fake/default bearer token is supplied.
    return requestChat(
      `${OVH_BASE}/v1/chat/completions`,
      messages,
      max_tokens,
      { 'Content-Type': 'application/json' },
      OVH_MODEL,
    );
  }

  if (!BASE) {
    const err = new Error('OPENAI_BASE_URL is not set');
    err.code = 'LLM_DISABLED';
    throw err;
  }
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({ model, messages, max_tokens, ...(task && (model === 'auto' || model === 'n3mak/auto') ? { task } : {}) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error?.message || `OmniRoute HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body.choices?.[0]?.message?.content ?? '';
}

module.exports = { chat, isEnabled, BASE, MODEL };
