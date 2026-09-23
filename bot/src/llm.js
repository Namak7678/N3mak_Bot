/**
 * OpenAI-compatible client: xAI Grok first, then OmniRoute.
 * Production must not use 127.0.0.1 (that only works on the local machine).
 */
function stripSlash(url) {
  return (url || '').replace(/\/$/, '');
}

function isLoopback(url) {
  return /127\.0\.0\.1|localhost/i.test(url || '');
}

const XAI_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || '';
const RAW_BASE = stripSlash(process.env.OPENAI_BASE_URL || '');
const IN_PROD = process.env.NODE_ENV === 'production';

const BASE = XAI_KEY
  ? 'https://api.x.ai/v1'
  : RAW_BASE && !(IN_PROD && isLoopback(RAW_BASE))
    ? RAW_BASE
    : '';

const KEY = XAI_KEY || process.env.OPENAI_API_KEY || '';
const MODEL =
  process.env.OPENAI_MODEL ||
  (XAI_KEY ? 'grok-4-latest' : 'xai/grok-4.3');

function isEnabled() {
  return Boolean(BASE && KEY);
}

async function chat(messages, { model = MODEL, max_tokens = 256 } = {}) {
  if (!isEnabled()) {
    const err = new Error(
      XAI_KEY
        ? 'LLM misconfigured'
        : 'Set XAI_API_KEY (preferred) or a public OPENAI_BASE_URL + OPENAI_API_KEY'
    );
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
    const err = new Error(body?.error?.message || `LLM HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body.choices?.[0]?.message?.content ?? '';
}

module.exports = { chat, isEnabled, BASE, MODEL };
