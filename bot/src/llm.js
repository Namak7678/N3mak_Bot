/**
 * OpenAI-compatible client for N3mak.
 * Prefer the dedicated internal Free AI route when explicitly enabled.
 * Never fall back from that route to a paid/legacy provider after an error.
 */
const BASE = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '');
const KEY = process.env.OPENAI_API_KEY || 'n3mak-local';
const MODEL = process.env.OPENAI_MODEL || 'cfp/openai/gpt-oss-20b';
const FREE_BASE = (process.env.N3MAK_FREE_AI_BASE_URL || '').replace(/\/$/, '');
const FREE_KEY = process.env.N3MAK_FREE_AI_TOKEN || '';
const FREE_ENABLED = process.env.N3MAK_FREE_AI_ENABLED === 'true' && Boolean(FREE_BASE && FREE_KEY);

function isEnabled() {
  return FREE_ENABLED || Boolean(BASE);
}

async function chat(messages, { model = MODEL, max_tokens = 256, task } = {}) {
  if (FREE_ENABLED) {
    const res = await fetch(`${FREE_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FREE_KEY}` },
      body: JSON.stringify({ model: 'n3mak/free', messages, max_tokens }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body?.error?.message || `N3mak Free AI HTTP ${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body.choices?.[0]?.message?.content ?? '';
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
