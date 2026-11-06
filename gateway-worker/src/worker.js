/**
 * n3mak-gateway — public OpenAI-compatible gateway for N3mak buyers.
 * Runs on Cloudflare Workers (workers.dev), backed by Workers AI + D1.
 *
 * Routes:
 *   GET  /v1/models                 (Bearer buyer key)
 *   POST /v1/chat/completions       (Bearer buyer key; non-stream + simple SSE stream)
 *   POST /webhooks/whop             (Standard Webhooks HMAC-SHA256, WHOP_WEBHOOK_SECRET)
 *   POST /admin/mint                (Bearer ADMIN_TOKEN)
 *   POST /admin/revoke              (Bearer ADMIN_TOKEN)
 *   GET  /health
 *
 * Bindings: AI (Workers AI), DB (D1). Secrets: ADMIN_TOKEN, WHOP_WEBHOOK_SECRET, TELEGRAM_BOT_TOKEN.
 * Vars: OWNER_TELEGRAM_ID, PUBLIC_BASE_URL.
 */

const PLAN_IDS = {
  plan_n2uiwphhI5YG7: 'pioneer',
  plan_IkWmnOwW1ShYY: 'starter',
  plan_SrqGnbkktuOUc: 'pro',
};

// Public model id -> Workers AI model
const MODELS = {
  'gpt-oss-20b': '@cf/openai/gpt-oss-20b',
  'llama-3.1-8b': '@cf/meta/llama-3.1-8b-instruct-fp8',
  'gpt-oss-120b': '@cf/openai/gpt-oss-120b',
  'mistral-small-3.1-24b': '@cf/mistralai/mistral-small-3.1-24b-instruct',
  'qwen2.5-coder-32b': '@cf/qwen/qwen2.5-coder-32b-instruct',
  'llama-3.3-70b': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
};
const DEFAULT_MODEL = 'gpt-oss-20b';

const PIONEER_MODELS = ['gpt-oss-20b', 'llama-3.1-8b'];
const STARTER_MODELS = [...PIONEER_MODELS, 'gpt-oss-120b', 'mistral-small-3.1-24b', 'qwen2.5-coder-32b'];

// Limits from marketing/tier-proposal.md
const TIERS = {
  pioneer: { label: 'Pioneer $3', rpd: 200, rpm: 5, models: PIONEER_MODELS, maxTokens: 1024 },
  starter: { label: 'Starter $9', rpd: 1000, rpm: 20, models: STARTER_MODELS, maxTokens: 4096 },
  pro: { label: 'Pro $49', rpd: 10000, rpm: 60, models: Object.keys(MODELS), maxTokens: 8192 },
};

const enc = new TextEncoder();

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra },
  });
}
function oaiError(status, message, type = 'invalid_request_error', code = null) {
  return json({ error: { message, type, code } }, status);
}

async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function bearer(req) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

/** Normalize "cfp/openai/gpt-oss-20b", "@cf/openai/gpt-oss-20b", "openai/gpt-oss-20b", "gpt-oss-20b" -> public id */
function resolveModel(input) {
  let m = String(input || DEFAULT_MODEL).trim();
  m = m.replace(/^cfp\//, '').replace(/^@cf\//, '').replace(/^n3mak\//, '');
  if (MODELS[m]) return m;
  const last = m.split('/').pop();
  if (MODELS[last]) return last;
  for (const [id, cf] of Object.entries(MODELS)) {
    if (cf.endsWith('/' + m) || cf.replace('@cf/', '') === m || cf.split('/').pop() === last) return id;
  }
  return null;
}

// ---------- keys ----------
async function mintKey(env, { plan, membershipId = null, telegramId = null, label = null }) {
  const tier = TIERS[plan];
  if (!tier) throw new Error('unknown plan');
  const key = 'n3k_' + randHex(24);
  const id = 'key_' + randHex(8);
  const hash = await sha256Hex(key);
  await env.DB.prepare(
    'INSERT INTO api_keys (id, key_hash, key_prefix, plan, membership_id, telegram_id, label, created_at) VALUES (?,?,?,?,?,?,?,?)'
  )
    .bind(id, hash, key.slice(0, 10), plan, membershipId, telegramId ? String(telegramId) : null, label, new Date().toISOString())
    .run();
  return { key, id, plan, limits: { rpd: tier.rpd, rpm: tier.rpm, models: tier.models } };
}

async function lookupKey(env, key) {
  if (!key || !key.startsWith('n3k_')) return null;
  const hash = await sha256Hex(key);
  const row = await env.DB.prepare('SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL').bind(hash).first();
  return row || null;
}

/** Atomic counter increment in D1; returns new count. */
async function bump(env, k, ttlSec) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    'INSERT INTO usage_counters (k, n, expires_at) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n'
  )
    .bind(k, now + ttlSec)
    .first();
  return row ? row.n : 1;
}

async function enforceLimits(env, row, ctx) {
  const tier = TIERS[row.plan] || TIERS.pioneer;
  const now = new Date();
  const minute = Math.floor(now.getTime() / 60000);
  const day = now.toISOString().slice(0, 10);
  const rpm = await bump(env, `m:${row.id}:${minute}`, 120);
  if (rpm > tier.rpm) {
    return { status: 429, msg: `Rate limit: ${tier.rpm} requests/minute on ${tier.label}`, retry: 60 - now.getUTCSeconds() };
  }
  const rpd = await bump(env, `d:${row.id}:${day}`, 172800);
  if (rpd > tier.rpd) {
    return { status: 429, msg: `Daily limit: ${tier.rpd} requests/day on ${tier.label}`, retry: 3600 };
  }
  // opportunistic cleanup of expired counters
  if (Math.random() < 0.02 && ctx) {
    ctx.waitUntil(env.DB.prepare('DELETE FROM usage_counters WHERE expires_at < ?').bind(Math.floor(Date.now() / 1000)).run());
  }
  return null;
}

// ---------- AI ----------
function extractText(out) {
  if (out == null) return '';
  if (typeof out === 'string') return out;
  if (typeof out.response === 'string') return out.response;
  if (out.response && typeof out.response === 'object') return JSON.stringify(out.response);
  if (Array.isArray(out.choices) && out.choices[0]) {
    const c = out.choices[0];
    return (c.message && (c.message.content ?? '')) || c.text || '';
  }
  if (Array.isArray(out.output)) {
    const parts = [];
    for (const item of out.output) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) if (typeof c.text === 'string') parts.push(c.text);
      }
    }
    if (parts.length) return parts.join('');
  }
  if (typeof out.output_text === 'string') return out.output_text;
  return '';
}

async function runChat(env, modelId, body, tier) {
  const cfModel = MODELS[modelId];
  const messages = (body.messages || []).map((m) => ({
    role: m.role,
    content: Array.isArray(m.content) ? m.content.map((p) => p.text || '').join('') : String(m.content ?? ''),
  }));
  const maxTokens = Math.min(Number(body.max_tokens || body.max_completion_tokens) || tier.maxTokens, tier.maxTokens);
  const input = { messages, max_tokens: maxTokens };
  if (typeof body.temperature === 'number') input.temperature = body.temperature;
  if (typeof body.top_p === 'number') input.top_p = body.top_p;
  if (cfModel.includes('gpt-oss')) {
    // gpt-oss uses Responses-style input on Workers AI
    const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const rest = messages.filter((m) => m.role !== 'system');
    const req = { input: rest, max_output_tokens: maxTokens, reasoning: { effort: 'low' } };
    if (sys) req.instructions = sys;
    try {
      const out = await env.AI.run(cfModel, req);
      const t = extractText(out);
      if (t) return { text: t, usage: out.usage };
    } catch (_) {}
  }
  const out = await env.AI.run(cfModel, input);
  return { text: extractText(out), usage: out && out.usage };
}

async function handleChat(req, env, ctx, row) {
  let body;
  try {
    body = await req.json();
  } catch (_) {
    return oaiError(400, 'Invalid JSON body');
  }
  if (!Array.isArray(body.messages) || !body.messages.length) return oaiError(400, '`messages` is required');
  const tier = TIERS[row.plan] || TIERS.pioneer;
  const modelId = resolveModel(body.model);
  if (!modelId) return oaiError(404, `Model not found: ${body.model}. See GET /v1/models`, 'invalid_request_error', 'model_not_found');
  if (!tier.models.includes(modelId)) {
    return oaiError(403, `Model ${modelId} is not included in ${tier.label}. Allowed: ${tier.models.join(', ')}`, 'permission_error', 'model_not_allowed');
  }
  const lim = await enforceLimits(env, row, ctx);
  if (lim) return json({ error: { message: lim.msg, type: 'rate_limit_error', code: 'rate_limit_exceeded' } }, 429, { 'retry-after': String(lim.retry) });

  let result;
  try {
    result = await runChat(env, modelId, body, tier);
  } catch (e) {
    return oaiError(502, 'Upstream model error: ' + (e && e.message ? e.message : 'unknown'), 'api_error');
  }
  const id = 'chatcmpl-' + randHex(12);
  const created = Math.floor(Date.now() / 1000);
  const usage = {
    prompt_tokens: (result.usage && (result.usage.prompt_tokens || result.usage.input_tokens)) || 0,
    completion_tokens: (result.usage && (result.usage.completion_tokens || result.usage.output_tokens)) || 0,
  };
  usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;

  if (body.stream) {
    const chunks = [
      { id, object: 'chat.completion.chunk', created, model: modelId, choices: [{ index: 0, delta: { role: 'assistant', content: result.text }, finish_reason: null }] },
      { id, object: 'chat.completion.chunk', created, model: modelId, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
    ];
    const sse = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
    return new Response(sse, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' } });
  }
  return json({
    id,
    object: 'chat.completion',
    created,
    model: modelId,
    choices: [{ index: 0, message: { role: 'assistant', content: result.text }, finish_reason: 'stop' }],
    usage,
  });
}

// ---------- Whop webhook (Standard Webhooks) ----------
const TOLERANCE_SEC = 5 * 60;
async function verifyWhop(raw, headers, secret) {
  if (!secret || !String(secret).trim()) return 'WHOP_SECRET_MISSING';
  const id = headers.get('webhook-id');
  const ts = headers.get('webhook-timestamp');
  const sigHeader = headers.get('webhook-signature');
  if (!id || !ts || !sigHeader) return 'WHOP_SIG_MISSING';
  if (!/^\d+$/.test(ts)) return 'WHOP_SIG_BAD_TS';
  if (Math.abs(Date.now() / 1000 - Number(ts)) > TOLERANCE_SEC) return 'WHOP_SIG_STALE';
  const k = await crypto.subtle.importKey('raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', k, enc.encode(`${id}.${ts}.${raw}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  const ok = sigHeader.split(' ').some((part) => {
    const [v, sig] = part.split(',');
    return v === 'v1' && sig && timingSafeEqualStr(sig, expected);
  });
  return ok ? null : 'WHOP_SIG_MISMATCH';
}

async function tg(env, chatId, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) return { ok: false, description: 'no token/chat' };
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  return r.json().catch(() => ({ ok: false }));
}

function baseUrl(env, req) {
  return (env.PUBLIC_BASE_URL || new URL(req.url).origin + '/v1').replace(/\/$/, '');
}

function deliveryText({ key, plan, membershipId, base, test }) {
  const t = TIERS[plan];
  return (
    (test ? '🧪 TEST ONLY — ignore / do not use in production.\n\n' : '') +
    `✅ تم تفعيل N3mak AI Gateway (${t.label})\n\n` +
    `BASE_URL: ${base}\n` +
    `API_KEY: ${key}\n` +
    `MODEL: gpt-oss-20b\n` +
    `Models: ${t.models.join(', ')}\n` +
    `Limits: ${t.rpd}/day, ${t.rpm}/min\n\n` +
    `Example:\n` +
    `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"gpt-oss-20b","messages":[{"role":"user","content":"Hello"}]}'\n\n` +
    (membershipId ? `Membership: ${membershipId}\n` : '') +
    `استخدمها مع أي OpenAI-compatible client. الدعم: @N3mak_bot — للترقية: /buy`
  );
}

async function fulfill(env, req, { plan, membershipId, telegramId, email, webhookId, event, test }) {
  // dedupe per membership
  if (membershipId) {
    const ins = await env.DB.prepare(
      'INSERT OR IGNORE INTO fulfillments (membership_id, plan_id, webhook_id, event, created_at) VALUES (?,?,?,?,?)'
    )
      .bind(membershipId, plan, webhookId || null, event || null, new Date().toISOString())
      .run();
    if (!ins.meta || ins.meta.changes === 0) return { duplicate: true, membershipId };
  }
  const minted = await mintKey(env, { plan, membershipId, telegramId, label: email || null });
  if (membershipId) {
    await env.DB.prepare('UPDATE fulfillments SET key_id = ? WHERE membership_id = ?').bind(minted.id, membershipId).run();
  }
  const base = baseUrl(env, req);
  const text = deliveryText({ key: minted.key, plan, membershipId, base, test });
  let buyerSent = null;
  if (telegramId) buyerSent = await tg(env, telegramId, text);
  if (env.OWNER_TELEGRAM_ID) {
    const ownerText =
      `💰 ${test ? '[TEST] ' : ''}N3mak sale: ${TIERS[plan].label}\n` +
      `Membership: ${membershipId || '-'}\nEmail: ${email || '-'}\nTelegram: ${telegramId || 'none'}\n` +
      `Buyer DM: ${telegramId ? (buyerSent && buyerSent.ok ? 'sent ✅' : 'FAILED — deliver manually') : 'no telegram_id — deliver manually'}\n` +
      `Key id: ${minted.id}\nKey: ${minted.key}\nBASE_URL: ${base}`;
    await tg(env, env.OWNER_TELEGRAM_ID, ownerText);
  }
  return { ...minted, buyerSent: buyerSent ? !!buyerSent.ok : null };
}

async function handleWhop(req, env) {
  const raw = await req.text();
  const err = await verifyWhop(raw, req.headers, env.WHOP_WEBHOOK_SECRET);
  if (err) return json({ ok: false, error: err }, 401);
  let body;
  try {
    body = JSON.parse(raw);
  } catch (_) {
    return json({ ok: false, error: 'bad json' }, 400);
  }
  const event = String(body.type || body.action || '');
  if (event && !/(membership\.(activated|went_valid)|payment\.succeeded|membership_activated|membership_went_valid)/i.test(event)) {
    return json({ ok: true, skipped: 'event', event });
  }
  const data = body.data || body;
  const planId = data.plan_id || (data.plan && data.plan.id) || (typeof data.plan === 'string' ? data.plan : '') || '';
  const plan = PLAN_IDS[planId];
  if (!plan) return json({ ok: true, skipped: 'other plan', planId });
  const membershipId =
    (/payment/i.test(event) ? data.membership_id || (data.membership && data.membership.id) : data.id) ||
    data.membership_id ||
    (data.membership && data.membership.id) ||
    data.id;
  if (!membershipId) return json({ ok: true, skipped: 'no membership' });
  const md = data.metadata || (data.membership && data.membership.metadata) || {};
  const telegramId = Number(md.telegram_id || data.telegram_id) || null;
  const email = data.email || (data.user && data.user.email) || null;
  const r = await fulfill(env, req, {
    plan,
    membershipId: String(membershipId),
    telegramId,
    email,
    webhookId: req.headers.get('webhook-id'),
    event,
  });
  if (r.duplicate) return json({ ok: true, duplicate: true, membershipId });
  return json({ ok: true, membershipId, keyId: r.id, buyerSent: r.buyerSent });
}

// ---------- admin ----------
function isAdmin(req, env) {
  const t = bearer(req);
  return !!env.ADMIN_TOKEN && timingSafeEqualStr(t, env.ADMIN_TOKEN);
}

async function handleAdminMint(req, env) {
  const b = await req.json().catch(() => ({}));
  const plan = PLAN_IDS[b.plan] || String(b.plan || 'pioneer').toLowerCase();
  if (!TIERS[plan]) return json({ ok: false, error: 'plan must be pioneer|starter|pro' }, 400);
  const test = !!b.test || String(b.membership_id || '').startsWith('test-');
  if (b.notify === false) {
    if (b.membership_id) {
      const ex = await env.DB.prepare('SELECT id FROM api_keys WHERE membership_id = ? AND revoked_at IS NULL').bind(b.membership_id).first();
      if (ex) return json({ ok: false, error: 'membership already has an active key', key_id: ex.id }, 409);
    }
    const m = await mintKey(env, { plan, membershipId: b.membership_id || null, telegramId: b.telegram_id || null, label: b.label || null });
    return json({ ok: true, ...m, base_url: baseUrl(env, req) });
  }
  const r = await fulfill(env, req, {
    plan,
    membershipId: b.membership_id || null,
    telegramId: Number(b.telegram_id) || null,
    email: b.email || b.label || null,
    event: 'admin.mint',
    test,
  });
  if (r.duplicate) return json({ ok: false, error: 'membership already fulfilled', membership_id: b.membership_id }, 409);
  return json({ ok: true, ...r, base_url: baseUrl(env, req) });
}

async function handleAdminRevoke(req, env) {
  const b = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  let res;
  if (b.key) res = await env.DB.prepare('UPDATE api_keys SET revoked_at = ? WHERE key_hash = ? AND revoked_at IS NULL').bind(now, await sha256Hex(b.key)).run();
  else if (b.key_id) res = await env.DB.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').bind(now, b.key_id).run();
  else if (b.membership_id) res = await env.DB.prepare('UPDATE api_keys SET revoked_at = ? WHERE membership_id = ? AND revoked_at IS NULL').bind(now, b.membership_id).run();
  else return json({ ok: false, error: 'key, key_id or membership_id required' }, 400);
  return json({ ok: true, revoked: res.meta ? res.meta.changes : 0 });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'authorization,content-type',
        },
      });
    }
    try {
      if (p === '/' || p === '/health') return json({ ok: true, service: 'n3mak-gateway', base_url: baseUrl(env, req) });
      if (p === '/webhooks/whop' && req.method === 'POST') return await handleWhop(req, env);
      if (p.startsWith('/admin/')) {
        if (!isAdmin(req, env)) return json({ ok: false, error: 'unauthorized' }, 401);
        if (p === '/admin/mint' && req.method === 'POST') return await handleAdminMint(req, env);
        if (p === '/admin/revoke' && req.method === 'POST') return await handleAdminRevoke(req, env);
        return json({ ok: false, error: 'not found' }, 404);
      }
      if (p === '/v1/models' || p === '/v1/chat/completions') {
        const row = await lookupKey(env, bearer(req));
        if (!row) return oaiError(401, 'Invalid or missing API key. Use: Authorization: Bearer <your N3mak key>', 'invalid_request_error', 'invalid_api_key');
        const tier = TIERS[row.plan] || TIERS.pioneer;
        if (p === '/v1/models' && req.method === 'GET') {
          return json({ object: 'list', data: tier.models.map((id) => ({ id, object: 'model', created: 0, owned_by: 'n3mak' })) });
        }
        if (p === '/v1/chat/completions' && req.method === 'POST') return await handleChat(req, env, ctx, row);
        return oaiError(405, 'Method not allowed');
      }
      return json({ error: { message: 'Not found', type: 'invalid_request_error' } }, 404);
    } catch (e) {
      return json({ error: { message: 'Internal error', type: 'api_error' } }, 500);
    }
  },
};
