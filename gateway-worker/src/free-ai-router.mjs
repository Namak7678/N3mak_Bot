const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const OPENROUTER_MODEL = 'openrouter/free';
const OVH_MODEL = 'gpt-oss-20b';
const OVH_BASE = 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1';
const TIMEOUT_MS = 12000;

function normalizeMessages(messages) {
  return messages.map((message) => ({
    role: String(message.role || 'user'),
    content: Array.isArray(message.content)
      ? message.content.map((part) => typeof part.text === 'string' ? part.text : '').join('')
      : String(message.content ?? ''),
  }));
}

async function readJson(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`provider_http_${response.status}`);
    error.status = response.status;
    throw error;
  }
  if (!payload || typeof payload !== 'object') throw new Error('provider_invalid_json');
  return payload;
}

async function callOpenRouter(env, messages, maxTokens, fetchImpl) {
  const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: OPENROUTER_MODEL, messages, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const payload = await readJson(response);
  const text = payload.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('provider_empty_response');
  return { text, provider: 'openrouter', model: OPENROUTER_MODEL };
}

async function callGemini(env, messages, maxTokens, fetchImpl) {
  const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\\n');
  const contents = messages.filter((message) => message.role !== 'system').map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'x-goog-api-key': env.GEMINI_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig: { maxOutputTokens: maxTokens },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const payload = await readJson(response);
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
  if (typeof text !== 'string' || !text.trim()) throw new Error('provider_empty_response');
  return { text, provider: 'gemini', model: GEMINI_MODEL };
}

async function callOVHAnonymous(messages, maxTokens, fetchImpl) {
  const response = await fetchImpl(`${OVH_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: OVH_MODEL, messages, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const payload = await readJson(response);
  const text = payload.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('provider_empty_response');
  return { text, provider: 'ovh-anonymous', model: OVH_MODEL };
}

export async function runFreeAI({ env = {}, messages, maxTokens = 1024, fetchImpl = fetch } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) throw new TypeError('messages_required');
  const normalized = normalizeMessages(messages);
  const limit = Math.max(1, Math.min(Number(maxTokens) || 1024, 4096));
  const providers = [];
  if (typeof env.OPENROUTER_API_KEY === 'string' && env.OPENROUTER_API_KEY.trim()) {
    providers.push(() => callOpenRouter(env, normalized, limit, fetchImpl));
  }
  // Operator must confirm the Google Cloud project has billing disabled.
  if (env.GEMINI_FREE_TIER_NO_BILLING === 'true' && typeof env.GEMINI_API_KEY === 'string' && env.GEMINI_API_KEY.trim()) {
    providers.push(() => callGemini(env, normalized, limit, fetchImpl));
  }
  // Always available as the no-key free fallback; OVH enforces 2 req/min/IP/model.
  providers.push(() => callOVHAnonymous(normalized, limit, fetchImpl));

  let lastError;
  for (const call of providers) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
    }
  }
  const error = new Error('all_free_providers_unavailable');
  error.code = 'free_ai_unavailable';
  error.cause = lastError;
  throw error;
}

export const FREE_AI_MODELS = Object.freeze({
  openrouter: OPENROUTER_MODEL,
  gemini: GEMINI_MODEL,
  ovh: OVH_MODEL,
});
