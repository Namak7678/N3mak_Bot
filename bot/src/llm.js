/**
 * Thin OpenAI-compatible client for OmniRoute → Grok.
 * Set OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL (see .env.example).
 * Callers should fail soft if the gateway is unreachable.
 */
const BASE = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '');
const KEY = process.env.OPENAI_API_KEY || 'n3mak-local';
const MODEL = process.env.OPENAI_MODEL || 'xai/grok-4.3';

function isEnabled() {
  return Boolean(BASE);
}

async function chat(messages, { model = MODEL, max_tokens = 256 } = {}) {
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
    body: JSON.stringify({ model, messages, max_tokens }),
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
