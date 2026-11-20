/**
 * OpenAI-compatible client for N3mak.
 * Explicit internal Free AI route takes priority, then OVH anonymous,
 * then the configured legacy provider. Free routes never fall back.
 */
const BASE = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '');
const KEY = process.env.OPENAI_API_KEY || 'n3mak-local';
const MODEL = process.env.OPENAI_MODEL || 'cfp/openai/gpt-oss-20b';
const FREE_BASE = (process.env.N3MAK_FREE_AI_BASE_URL || '').replace(/\/$/, '');
const FREE_KEY = process.env.N3MAK_FREE_AI_TOKEN || '';
const FREE_ENABLED = process.env.N3MAK_FREE_AI_ENABLED === 'true' && Boolean(FREE_BASE && FREE_KEY);

// OVH's documented anonymous API is the shared OpenAI-compatible base URL.
// It requires no Authorization header and is rate-limited to 2 req/min/IP/model.
const OVH_BASE = (process.env.N3MAK_OVH_ANON_BASE_URL ||
  'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1').replace(/\/$/, '');
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
    return requestChat(
      `${OVH_BASE}/chat/completions`,
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
  return requestChat(
    `${BASE}/chat/completions`,
    messages,
    max_tokens,
    { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    model === 'auto' || model === 'n3mak/auto' ? model : model,
  );
}

module.exports = { chat, isEnabled, BASE, MODEL };
