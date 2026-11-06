/**
 * After Whop payment (Pioneer $3 / Starter $9 / Pro $49): mint a REAL OmniRoute
 * API key and deliver it (Telegram when telegram_id is present).
 * Trigger: POST /webhooks/whop (membership / payment succeeded events).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { getTierLimits, resolvePlanKey } = require('./tierLimits');

const PIONEER_PLAN = process.env.WHOP_PIONEER_PLAN_ID || 'plan_n2uiwphhI5YG7';
const STARTER_PLAN = process.env.WHOP_PLAN_ID || 'plan_IkWmnOwW1ShYY';
const PRO_PLAN = process.env.WHOP_PRO_PLAN_ID || 'plan_SrqGnbkktuOUc';

const ALLOWED_PLANS = new Set([
  PIONEER_PLAN,
  STARTER_PLAN,
  PRO_PLAN,
  'plan_n2uiwphhI5YG7',
  'plan_IkWmnOwW1ShYY',
  'plan_SrqGnbkktuOUc',
]);
const PLAN_ID = STARTER_PLAN;

const PLAN_LABEL = {
  [PIONEER_PLAN]: 'Pioneer $3',
  [STARTER_PLAN]: 'Starter $9',
  [PRO_PLAN]: 'Pro $49',
  plan_n2uiwphhI5YG7: 'Pioneer $3',
  plan_IkWmnOwW1ShYY: 'Starter $9',
  plan_SrqGnbkktuOUc: 'Pro $49',
};

function publicBaseUrl() {
  const pub = (process.env.OMNIROUTE_PUBLIC_BASE_URL || '').trim();
  if (pub && !/127\.0\.0\.1|localhost/i.test(pub)) return pub.replace(/\/$/, '');
  return '';
}

const BASE_URL =
  publicBaseUrl() ||
  process.env.OMNIROUTE_PUBLIC_BASE_URL ||
  process.env.OPENAI_BASE_URL ||
  'http://127.0.0.1:20128/v1';

const OMNI_ADMIN_BASE = (
  process.env.OMNIROUTE_ADMIN_BASE_URL ||
  process.env.OMNIROUTE_BASE_URL ||
  'http://127.0.0.1:20128'
).replace(/\/$/, '');

function isAllowedPlan(planId) {
  if (!planId) return true; // some events omit plan — still fulfill
  if (String(planId).includes('UKIjanDMOoEGV')) return false;
  return ALLOWED_PLANS.has(String(planId));
}

function planLabel(planId) {
  if (!planId) return 'N3mak';
  return PLAN_LABEL[String(planId)] || String(planId);
}

/** Legacy deterministic string — NOT a real OmniRoute key. Kept for tests only. */
function mintKey(membershipId) {
  const raw = crypto
    .createHash('sha256')
    .update(`n3mak:${membershipId}:${process.env.FULFILL_SECRET || 'n3mak-dev'}`)
    .digest('hex')
    .slice(0, 32);
  return `n3mak_${raw}`;
}

function readApiKeySecret() {
  if (process.env.OMNIROUTE_API_KEY_SECRET) return process.env.OMNIROUTE_API_KEY_SECRET.trim();
  const candidates = [
    process.env.OMNIROUTE_ENV_FILE,
    path.join(os.homedir(), '.omniroute', 'server.env'),
    '/workspace/omniroute/.env',
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      const m = text.match(/^API_KEY_SECRET=(.*)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch (_) {}
  }
  return '';
}

function machineIdFromExistingKey() {
  const k = process.env.OMNIROUTE_MACHINE_ID || process.env.OPENAI_API_KEY || '';
  const m = String(k).match(/^sk-([a-f0-9]{16})-/i);
  if (m) return m[1];
  return process.env.OMNIROUTE_MACHINE_ID || '6c7d6a2ee21fdf50';
}

function generateOmniKey(machineId, secret) {
  const keyId = crypto.randomBytes(3).toString('hex');
  const crc = crypto
    .pbkdf2Sync(machineId + keyId, secret, 1000, 32, 'sha256')
    .toString('hex')
    .slice(0, 8);
  return `sk-${machineId}-${keyId}-${crc}`;
}

function sqlitePath() {
  return (
    process.env.OMNIROUTE_SQLITE_PATH ||
    path.join(os.homedir(), '.omniroute', 'storage.sqlite')
  );
}

/** Create a real OmniRoute key via management HTTP API (preferred). */
async function createKeyViaHttp(name) {
  const manageKey =
    process.env.OMNIROUTE_MANAGE_API_KEY ||
    process.env.OMNIROUTE_API_KEY ||
    process.env.OPENAI_API_KEY;
  if (!manageKey) throw new Error('no manage api key configured');
  const res = await fetch(`${OMNI_ADMIN_BASE}/api/keys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${manageKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.key) {
    const err = new Error(body?.error?.message || body?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return { key: body.key, id: body.id, via: 'http' };
}

/** Fallback: mint into OmniRoute SQLite via Python helper (no native addon). */
function createKeyViaSqlite(name, planId) {
  const { execFileSync } = require('child_process');
  const script = path.join(__dirname, 'mint_omni_key.py');
  const plan = resolvePlanKey(planId);
  const out = execFileSync('python3', [script, name, plan], {
    encoding: 'utf8',
    env: { ...process.env, N3MAK_PLAN: plan },
    timeout: 15000,
  }).trim();
  const parsed = JSON.parse(out);
  if (!parsed.key) throw new Error('sqlite mint returned no key');
  return { key: parsed.key, id: parsed.id, via: 'sqlite', limits: parsed.limits || null, plan: parsed.plan || plan };
}

/** Apply tier limits after HTTP create (POST /api/keys does not set RPD/RPM). */
function applyTierLimitsSqlite(keyId, planId) {
  const tier = getTierLimits(planId);
  const Database = null;
  const { execFileSync } = require('child_process');
  const sql = `
import sqlite3, json, os
from pathlib import Path
db = os.environ.get('OMNIROUTE_SQLITE_PATH') or str(Path.home()/'.omniroute'/'storage.sqlite')
con = sqlite3.connect(db)
con.execute('''UPDATE api_keys SET
  max_requests_per_day=?, max_requests_per_minute=?,
  model_access_mode=?, allowed_models=?,
  usage_limit_enabled=?, daily_usage_limit_usd=?
  WHERE id=?''', (
  int(os.environ['RPD']), int(os.environ['RPM']),
  os.environ['MODE'], os.environ['MODELS'],
  1, float(os.environ['USD']), os.environ['KID']))
con.commit(); print('updated', con.total_changes); con.close()
`
  execFileSync('python3', ['-c', sql], {
    encoding: 'utf8',
    env: {
      ...process.env,
      RPD: String(tier.maxRequestsPerDay),
      RPM: String(tier.maxRequestsPerMinute),
      MODE: tier.modelAccessMode,
      MODELS: JSON.stringify(tier.allowedModels),
      USD: String(tier.dailyUsageLimitUsd),
      KID: keyId,
    },
    timeout: 10000,
  });
  return tier;
}

/** Public Cloudflare gateway (n3mak-gateway Worker). Preferred: keys work from the internet. */
function gatewayAdminToken() {
  if (process.env.N3MAK_GATEWAY_ADMIN_TOKEN) return process.env.N3MAK_GATEWAY_ADMIN_TOKEN.trim();
  const f =
    process.env.N3MAK_GATEWAY_ADMIN_TOKEN_FILE ||
    path.join(__dirname, '..', '..', '..', 'secrets', 'n3mak-gateway.admin-token');
  try {
    return fs.readFileSync(f, 'utf8').trim();
  } catch (_) {
    return '';
  }
}

function gatewayOrigin() {
  const u = (process.env.N3MAK_GATEWAY_URL || '').trim();
  if (u) return u.replace(/\/$/, '');
  const pub = publicBaseUrl();
  if (/workers\.dev/i.test(pub)) return pub.replace(/\/v1$/, '');
  return '';
}

async function createKeyViaGateway({ membershipId, planId }) {
  const origin = gatewayOrigin();
  const token = gatewayAdminToken();
  if (!origin || !token) throw new Error('gateway not configured');
  const res = await fetch(`${origin}/admin/mint`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: resolvePlanKey(planId), membership_id: membershipId || null, notify: false }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.key) throw new Error(body.error || `gateway HTTP ${res.status}`);
  const tier = getTierLimits(planId);
  return {
    key: body.key,
    id: body.id,
    via: 'gateway',
    baseUrl: body.base_url,
    limits: {
      max_requests_per_day: body.limits?.rpd ?? tier.maxRequestsPerDay,
      max_requests_per_minute: body.limits?.rpm ?? tier.maxRequestsPerMinute,
      allowed_models: body.limits?.models || [],
    },
  };
}

async function createOmniRouteKey({ membershipId, planId }) {
  if (gatewayOrigin() && gatewayAdminToken()) {
    return createKeyViaGateway({ membershipId, planId });
  }
  const name = `whop-${planLabel(planId).replace(/\s+/g, '-').toLowerCase()}-${String(membershipId).slice(0, 24)}`;
  const tier = getTierLimits(planId);
  try {
    const created = await createKeyViaHttp(name);
    try {
      applyTierLimitsSqlite(created.id, planId);
      created.limits = {
        max_requests_per_day: tier.maxRequestsPerDay,
        max_requests_per_minute: tier.maxRequestsPerMinute,
        model_access_mode: tier.modelAccessMode,
        allowed_models: tier.allowedModels,
        usage_limit_enabled: tier.usageLimitEnabled,
        daily_usage_limit_usd: tier.dailyUsageLimitUsd,
      };
      created.limitsVia = 'sqlite-patch';
    } catch (e) {
      created.limitsError = e.message;
    }
    return created;
  } catch (httpErr) {
    try {
      const created = createKeyViaSqlite(name, planId);
      created.httpError = httpErr.message;
      return created;
    } catch (sqliteErr) {
      const err = new Error(
        `OmniRoute key create failed (http: ${httpErr.message}; sqlite: ${sqliteErr.message})`
      );
      throw err;
    }
  }
}

function deliveryMessage({ key, email, membershipId, planId, baseUrl, limits }) {
  const label = planLabel(planId);
  const base = baseUrl || publicBaseUrl() || BASE_URL;
  const local = /127\.0\.0\.1|localhost/i.test(base);
  const tier = limits || getTierLimits(planId);
  const lim =
    tier && (tier.maxRequestsPerMinute || tier.max_requests_per_minute)
      ? `\nLimits: ${tier.maxRequestsPerDay || tier.max_requests_per_day}/day, ${tier.maxRequestsPerMinute || tier.max_requests_per_minute}/min\n`
      : '';
  return (
    `✅ تم تفعيل N3mak AI Gateway (${label})\n\n` +
    `BASE_URL: ${base}\n` +
    `API_KEY: ${key}\n` +
    `MODEL: gpt-oss-20b\n` +
    lim +
    (local
      ? ''
      : `\nExample:\ncurl ${base}/chat/completions -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d '{"model":"gpt-oss-20b","messages":[{"role":"user","content":"Hello"}]}'\n`) +
    (local
      ? '\n⚠️ Public gateway URL not ready yet — do not use 127.0.0.1 from your device. Contact @N3mak_bot support for the live BASE_URL.\n'
      : '') +
    `\nMembership: ${membershipId}\n` +
    (planId ? `Plan: ${planId}\n` : '') +
    (email ? `Email: ${email}\n` : '') +
    `\nاستخدمها كـ OpenAI-compatible client. Bot: @N3mak_bot\n` +
    `للترقية: /buy على @N3mak_bot`
  );
}

function recordFulfillment(entry) {
  const dir = path.join('/tmp', 'n3mak-fulfillments');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${entry.membershipId}.json`);
  fs.writeFileSync(file, JSON.stringify(entry, null, 2));
  return file;
}

function fulfillmentPath(membershipId) {
  return path.join('/tmp', 'n3mak-fulfillments', `${membershipId}.json`);
}

function readExistingFulfillment(membershipId) {
  try {
    const file = fulfillmentPath(membershipId);
    if (!fs.existsSync(file)) return null;
    return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (_) {
    return null;
  }
}

async function fulfillMembership({ membershipId, email, telegramId, sendTelegram, planId, webhookId }) {
  if (!isAllowedPlan(planId)) {
    return { skipped: true, reason: 'disallowed_plan', planId };
  }
  const existing = readExistingFulfillment(membershipId);
  if (existing?.data?.key) {
    return {
      skipped: true,
      reason: 'already_fulfilled',
      membershipId,
      keyId: existing.data.keyId || null,
      file: existing.file,
      duplicate: true,
      webhookId: webhookId || null,
    };
  }
  const created = await createOmniRouteKey({ membershipId, planId });
  const key = created.key;
  const base = created.baseUrl || publicBaseUrl() || BASE_URL;
  const msg = deliveryMessage({ key, email, membershipId, planId, baseUrl: base, limits: created.limits });
  const file = recordFulfillment({
    membershipId,
    email,
    telegramId,
    planId: planId || null,
    planLabel: planLabel(planId),
    key,
    keyId: created.id || null,
    mintVia: created.via,
    limits: created.limits || null,
    baseUrl: base,
    webhookId: webhookId || null,
    at: new Date().toISOString(),
  });
  if (telegramId && typeof sendTelegram === 'function') {
    await sendTelegram(telegramId, msg);
  }
  return { key, file, msg, via: created.via, planId, limits: created.limits || null };
}

module.exports = {
  fulfillMembership,
  mintKey,
  createOmniRouteKey,
  deliveryMessage,
  publicBaseUrl,
  PLAN_ID,
  PIONEER_PLAN,
  STARTER_PLAN,
  PRO_PLAN,
  ALLOWED_PLANS,
  isAllowedPlan,
  planLabel,
  getTierLimits,
  resolvePlanKey,
};
