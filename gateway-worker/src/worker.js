/**
 * n3mak-gateway — public OpenAI-compatible gateway for N3mak buyers.
 * Runs on Cloudflare Workers (workers.dev), backed by Workers AI + D1.
 *
 * Routes:
 *   GET  /v1/models                 (Bearer buyer key)
 *   POST /v1/chat/completions       (Bearer buyer key; non-stream + simple SSE stream)
 *   POST /v1/demo/chat              (anonymous, CORS-limited, gpt-oss-20b, rate-limited)
 *   POST /webhooks/whop             (Standard Webhooks HMAC-SHA256, WHOP_WEBHOOK_SECRET)
 *   POST /admin/mint                (Bearer ADMIN_TOKEN) — paid plans + trial
 *   POST /admin/revoke              (Bearer ADMIN_TOKEN)
 *   GET  /admin/trials/nudge-pending (Bearer ADMIN_TOKEN)
 *   POST /admin/trials/nudge-mark   (Bearer ADMIN_TOKEN)
 *   GET  /health
 *
 * Bindings: AI (Workers AI), DB (D1).
 * Secrets: ADMIN_TOKEN, WHOP_WEBHOOK_SECRET, TELEGRAM_BOT_TOKEN.
 * Vars: OWNER_TELEGRAM_ID, PUBLIC_BASE_URL, TRIAL_GLOBAL_RPD, DEMO_GLOBAL_RPD.
 */

const PLAN_IDS = {
  plan_n2uiwphhI5YG7: 'pioneer',
  plan_IkWmnOwW1ShYY: 'starter',
  plan_SrqGnbkktuOUc: 'pro',
};

const PIONEER_CHECKOUT = 'https://whop.com/checkout/plan_n2uiwphhI5YG7';

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

const TIERS = {
  trial: { label: 'Free trial', rpd: 20, rpm: 5, models: ['gpt-oss-20b'], maxTokens: 1024, ttlHours: 24 },
  pioneer: { label: 'Pioneer $3', rpd: 200, rpm: 5, models: PIONEER_MODELS, maxTokens: 1024 },
  starter: { label: 'Starter $9', rpd: 1000, rpm: 20, models: STARTER_MODELS, maxTokens: 4096 },
  pro: { label: 'Pro $49', rpd: 10000, rpm: 60, models: Object.keys(MODELS), maxTokens: 8192 },
};

const DEMO_SYSTEM =
  'You are N3mak demo. Answer in at most 3 short sentences. Be helpful and concrete. Prefer Arabic if the user writes Arabic.';

const ALLOWED_DEMO_ORIGINS = new Set([
  'https://n3mak-buy.vercel.app',
  'https://n3mak-web.vercel.app',
  'https://n3mak.vercel.app',
]);

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

function trialGlobalCap(env) {
  const n = Number(env.TRIAL_GLOBAL_RPD);
  return Number.isFinite(n) && n > 0 ? n : 1500;
}
function demoGlobalCap(env) {
  const n = Number(env.DEMO_GLOBAL_RPD);
  return Number.isFinite(n) && n > 0 ? n : 300;
}

function isExpired(row) {
  if (!row || !row.expires_at) return false;
  return Date.parse(row.expires_at) <= Date.now();
}

function corsOriginAllowed(origin) {
  if (!origin) return true; // curl / server-to-server
  if (ALLOWED_DEMO_ORIGINS.has(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname;
    if (host === 'netlify.app' || host.endsWith('.netlify.app')) return true;
    return false;
  } catch (_) {
    return false;
  }
}

function corsHeaders(origin) {
  const h = {
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
  };
  if (!origin) {
    h['access-control-allow-origin'] = '*';
  } else if (corsOriginAllowed(origin)) {
    h['access-control-allow-origin'] = origin;
    h['vary'] = 'Origin';
  }
  return h;
}

// ---------- keys ----------
async function mintKey(env, { plan, membershipId = null, telegramId = null, label = null, storePlain = false }) {
  const tier = TIERS[plan];
  if (!tier) throw new Error('unknown plan');
  const key = 'n3k_' + randHex(24);
  const id = 'key_' + randHex(8);
  const hash = await sha256Hex(key);
  const created = new Date();
  const expiresAt = tier.ttlHours ? new Date(created.getTime() + tier.ttlHours * 3600 * 1000).toISOString() : null;
  await env.DB.prepare(
    'INSERT INTO api_keys (id, key_hash, key_prefix, plan, membership_id, telegram_id, label, created_at, expires_at, key_plain) VALUES (?,?,?,?,?,?,?,?,?,?)'
  )
    .bind(
      id,
      hash,
      key.slice(0, 10),
      plan,
      membershipId,
      telegramId ? String(telegramId) : null,
      label,
      created.toISOString(),
      expiresAt,
      storePlain ? key : null
    )
    .run();
  return {
    key,
    id,
    plan,
    expires_at: expiresAt,
    limits: { rpd: tier.rpd, rpm: tier.rpm, models: tier.models },
  };
}

async function lookupKey(env, key) {
  if (!key || !key.startsWith('n3k_')) return null;
  const hash = await sha256Hex(key);
  const row = await env.DB.prepare('SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL').bind(hash).first();
  return row || null;
}

async function bump(env, k, ttlSec) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    'INSERT INTO usage_counters (k, n, expires_at) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n'
  )
    .bind(k, now + ttlSec)
    .first();
  return row ? row.n : 1;
}

async function peek(env, k) {
  const row = await env.DB.prepare('SELECT n FROM usage_counters WHERE k = ?').bind(k).first();
  return row ? Number(row.n) : 0;
}

async function enforceLimits(env, row, ctx) {
  const tier = TIERS[row.plan] || TIERS.pioneer;
  const now = new Date();
  const minute = Math.floor(now.getTime() / 60000);
  const day = now.toISOString().slice(0, 10);

  if (row.plan === 'trial') {
    const g = await bump(env, `trialg:${day}`, 172800);
    if (g > trialGlobalCap(env)) {
      return {
        status: 429,
        msg: 'trial capacity reached, get Pioneer $3',
        code: 'trial_capacity_reached',
        retry: 3600,
        upgrade: true,
      };
    }
  }

  const rpm = await bump(env, `m:${row.id}:${minute}`, 120);
  if (rpm > tier.rpm) {
    return { status: 429, msg: `Rate limit: ${tier.rpm} requests/minute on ${tier.label}`, retry: 60 - now.getUTCSeconds() };
  }
  const rpd = await bump(env, `d:${row.id}:${day}`, 172800);
  if (rpd > tier.rpd) {
    if (row.plan === 'trial' && !row.limit_hit_at) {
      try {
        await env.DB.prepare('UPDATE api_keys SET limit_hit_at = ? WHERE id = ? AND limit_hit_at IS NULL')
          .bind(now.toISOString(), row.id)
          .run();
      } catch (_) {}
    }
    return {
      status: 429,
      msg: row.plan === 'trial'
        ? `Daily trial limit (${tier.rpd}/day) reached. Upgrade: ${PIONEER_CHECKOUT}`
        : `Daily limit: ${tier.rpd} requests/day on ${tier.label}`,
      retry: 3600,
      upgrade: row.plan === 'trial',
    };
  }
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
  if (lim) {
    const payload = {
      error: {
        message: lim.msg,
        type: 'rate_limit_error',
        code: lim.code || 'rate_limit_exceeded',
      },
    };
    if (lim.upgrade) payload.upgrade_url = PIONEER_CHECKOUT;
    return json(payload, 429, { 'retry-after': String(lim.retry) });
  }

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

// ---------- Demo (anonymous) ----------
async function handleDemoChat(req, env, ctx) {
  const origin = req.headers.get('origin');
  if (origin && !corsOriginAllowed(origin)) {
    return json({ error: 'origin not allowed', upgrade_url: PIONEER_CHECKOUT }, 403, corsHeaders(origin));
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405, corsHeaders(origin));
  }

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'invalid JSON' }, 400, corsHeaders(origin));
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return json({ error: 'prompt is required' }, 400, corsHeaders(origin));
  if (prompt.length > 500) return json({ error: 'prompt must be at most 500 characters' }, 400, corsHeaders(origin));

  const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim() || 'unknown';
  const now = new Date();
  const minute = Math.floor(now.getTime() / 60000);
  const day = now.toISOString().slice(0, 10);

  const ipMin = await bump(env, `demo:m:${ip}:${minute}`, 120);
  if (ipMin > 1) {
    return json(
      { error: 'demo rate limit: 1 request/minute', upgrade_url: PIONEER_CHECKOUT },
      429,
      { ...corsHeaders(origin), 'retry-after': String(60 - now.getUTCSeconds()) }
    );
  }
  const ipDay = await bump(env, `demo:d:${ip}:${day}`, 172800);
  if (ipDay > 3) {
    return json(
      { error: 'demo daily limit: 3 requests/day per IP', upgrade_url: PIONEER_CHECKOUT },
      429,
      { ...corsHeaders(origin), 'retry-after': '3600' }
    );
  }
  const gDay = await bump(env, `demo:g:${day}`, 172800);
  const gCap = demoGlobalCap(env);
  if (gDay > gCap) {
    return json(
      { error: 'demo capacity reached for today', upgrade_url: PIONEER_CHECKOUT },
      429,
      { ...corsHeaders(origin), 'retry-after': '3600' }
    );
  }

  let result;
  try {
    result = await runChat(
      env,
      'gpt-oss-20b',
      {
        messages: [
          { role: 'system', content: DEMO_SYSTEM },
          { role: 'user', content: prompt },
        ],
        max_tokens: 256,
      },
      { maxTokens: 256 }
    );
  } catch (e) {
    return json({ error: 'upstream model error' }, 502, corsHeaders(origin));
  }

  const remaining = Math.max(0, 3 - ipDay);
  return json(
    { reply: result.text || '', model: 'gpt-oss-20b', remaining },
    200,
    corsHeaders(origin)
  );
}

// ---------- Whop webhook ----------
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

async function mintTrial(env, req, b) {
  const telegramId = b.telegram_id != null ? String(b.telegram_id) : null;
  if (!telegramId) return json({ ok: false, error: 'telegram_id required for trial' }, 400);

  const existing = await env.DB.prepare(
    "SELECT * FROM api_keys WHERE plan = 'trial' AND telegram_id = ? ORDER BY created_at DESC LIMIT 1"
  )
    .bind(telegramId)
    .first();

  if (existing) {
    const expired = isExpired(existing) || !!existing.revoked_at;
    if (!expired) {
      return json({
        ok: true,
        already: true,
        key: existing.key_plain || null,
        id: existing.id,
        plan: 'trial',
        expires_at: existing.expires_at,
        base_url: baseUrl(env, req),
        limits: { rpd: TIERS.trial.rpd, rpm: TIERS.trial.rpm, models: TIERS.trial.models },
        message: existing.key_plain
          ? 'existing active trial key returned'
          : 'active trial exists but plaintext unavailable — use the key from the earlier DM',
      });
    }
    return json(
      {
        ok: false,
        error: 'trial_already_used',
        message: 'Free trial already used. Get Pioneer $3.',
        upgrade_url: PIONEER_CHECKOUT,
        expired_at: existing.expires_at,
        key_id: existing.id,
      },
      409
    );
  }

  const label = b.label || (b.test ? 'TEST trial' : 'trial');
  const minted = await mintKey(env, {
    plan: 'trial',
    membershipId: null,
    telegramId,
    label,
    storePlain: true,
  });
  return json({
    ok: true,
    already: false,
    ...minted,
    base_url: baseUrl(env, req),
  });
}

async function handleAdminMint(req, env) {
  const b = await req.json().catch(() => ({}));
  let plan = PLAN_IDS[b.plan] || String(b.plan || 'pioneer').toLowerCase();
  if (plan === 'trial') return mintTrial(env, req, b);
  if (!TIERS[plan] || plan === 'trial') return json({ ok: false, error: 'plan must be pioneer|starter|pro|trial' }, 400);
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
  else if (b.telegram_id && b.plan === 'trial') {
    res = await env.DB.prepare("UPDATE api_keys SET revoked_at = ? WHERE telegram_id = ? AND plan = 'trial' AND revoked_at IS NULL")
      .bind(now, String(b.telegram_id))
      .run();
  } else return json({ ok: false, error: 'key, key_id, membership_id or (telegram_id+plan=trial) required' }, 400);
  return json({ ok: true, revoked: res.meta ? res.meta.changes : 0 });
}

async function handleNudgePending(env) {
  const nowIso = new Date().toISOString();
  const rows = await env.DB.prepare(
    `SELECT id, telegram_id, expires_at, limit_hit_at, created_at, label
     FROM api_keys
     WHERE plan = 'trial'
       AND telegram_id IS NOT NULL
       AND nudged_at IS NULL
       AND (expires_at <= ? OR limit_hit_at IS NOT NULL)
     ORDER BY created_at ASC
     LIMIT 50`
  )
    .bind(nowIso)
    .all();
  return json({
    ok: true,
    trials: (rows.results || []).map((r) => ({
      key_id: r.id,
      telegram_id: r.telegram_id,
      expires_at: r.expires_at,
      limit_hit_at: r.limit_hit_at,
      reason: r.limit_hit_at && (!r.expires_at || Date.parse(r.expires_at) > Date.now()) ? 'daily_limit' : 'expired',
    })),
    upgrade_url: PIONEER_CHECKOUT,
  });
}

async function handleNudgeMark(req, env) {
  const b = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  let res;
  if (b.key_id) {
    res = await env.DB.prepare('UPDATE api_keys SET nudged_at = ? WHERE id = ? AND nudged_at IS NULL').bind(now, b.key_id).run();
  } else if (Array.isArray(b.key_ids) && b.key_ids.length) {
    let changes = 0;
    for (const id of b.key_ids.slice(0, 100)) {
      const r = await env.DB.prepare('UPDATE api_keys SET nudged_at = ? WHERE id = ? AND nudged_at IS NULL').bind(now, id).run();
      changes += r.meta ? r.meta.changes : 0;
    }
    return json({ ok: true, marked: changes });
  } else {
    return json({ ok: false, error: 'key_id or key_ids required' }, 400);
  }
  return json({ ok: true, marked: res.meta ? res.meta.changes : 0 });
}

function authGate(req, env, row) {
  if (!row) {
    return oaiError(401, 'Invalid or missing API key. Use: Authorization: Bearer <your N3mak key>', 'invalid_request_error', 'invalid_api_key');
  }
  if (isExpired(row)) {
    return json(
      {
        error: {
          message: `Trial expired. Get Pioneer $3: ${PIONEER_CHECKOUT}`,
          type: 'invalid_request_error',
          code: 'trial_expired',
        },
        upgrade_url: PIONEER_CHECKOUT,
      },
      401
    );
  }
  return null;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    const origin = req.headers.get('origin');

    if (req.method === 'OPTIONS') {
      if (p === '/v1/demo/chat') {
        if (origin && !corsOriginAllowed(origin)) {
          return json({ error: 'origin not allowed' }, 403, corsHeaders(origin));
        }
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
      }
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'authorization,content-type',
        },
      });
    }

    try {
      if (p === '/' || p === '/health') {
        return json({
          ok: true,
          service: 'n3mak-gateway',
          base_url: baseUrl(env, req),
          features: { trial: true, demo: true },
        });
      }
      if (p === '/webhooks/whop' && req.method === 'POST') return await handleWhop(req, env);

      if (p === '/v1/demo/chat') return await handleDemoChat(req, env, ctx);

      if (p.startsWith('/admin/')) {
        if (!isAdmin(req, env)) return json({ ok: false, error: 'unauthorized' }, 401);
        if (p === '/admin/mint' && req.method === 'POST') return await handleAdminMint(req, env);
        if (p === '/admin/revoke' && req.method === 'POST') return await handleAdminRevoke(req, env);
        if (p === '/admin/trials/nudge-pending' && req.method === 'GET') return await handleNudgePending(env);
        if (p === '/admin/trials/nudge-mark' && req.method === 'POST') return await handleNudgeMark(req, env);
        return json({ ok: false, error: 'not found' }, 404);
      }

      if (p === '/v1/models' || p === '/v1/chat/completions') {
        const row = await lookupKey(env, bearer(req));
        const gate = authGate(req, env, row);
        if (gate) return gate;
        const tier = TIERS[row.plan] || TIERS.pioneer;
        if (p === '/v1/models' && req.method === 'GET') {
          return json({ object: 'list', data: tier.models.map((id) => ({ id, object: 'model', created: 0, owned_by: 'n3mak' })) });
        }
        if (p === '/v1/chat/completions' && req.method === 'POST') return await handleChat(req, env, ctx, row);
        return oaiError(405, 'Method not allowed');
      }
      return json({ error: { message: 'Not found', type: 'invalid_request_error' } }, 404);
    } catch (e) {
      return json({ error: { message: 'Internal error', type: 'api_error', detail: String(e && e.message || e) } }, 500);
    }
  },
};
