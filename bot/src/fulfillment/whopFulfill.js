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

const BASE_URL =
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
function createKeyViaSqlite(name) {
  const { execFileSync } = require('child_process');
  const script = path.join(__dirname, 'mint_omni_key.py');
  const out = execFileSync('python3', [script, name], {
    encoding: 'utf8',
    env: { ...process.env },
    timeout: 15000,
  }).trim();
  const parsed = JSON.parse(out);
  if (!parsed.key) throw new Error('sqlite mint returned no key');
  return { key: parsed.key, id: parsed.id, via: 'sqlite' };
}

async function createOmniRouteKey({ membershipId, planId }) {
  const name = `whop-${planLabel(planId).replace(/\s+/g, '-').toLowerCase()}-${String(membershipId).slice(0, 24)}`;
  try {
    return await createKeyViaHttp(name);
  } catch (httpErr) {
    try {
      const created = createKeyViaSqlite(name);
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

function deliveryMessage({ key, email, membershipId, planId, baseUrl }) {
  const label = planLabel(planId);
  return (
    `✅ تم تفعيل N3mak AI Gateway (${label})\n\n` +
    `BASE_URL: ${baseUrl || BASE_URL}\n` +
    `API_KEY: ${key}\n` +
    `MODEL: cfp/openai/gpt-oss-20b (أو أي نموذج متاح عبر OmniRoute)\n\n` +
    `Membership: ${membershipId}\n` +
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

async function fulfillMembership({ membershipId, email, telegramId, sendTelegram, planId }) {
  if (!isAllowedPlan(planId)) {
    return { skipped: true, reason: 'disallowed_plan', planId };
  }
  const created = await createOmniRouteKey({ membershipId, planId });
  const key = created.key;
  const msg = deliveryMessage({ key, email, membershipId, planId });
  const file = recordFulfillment({
    membershipId,
    email,
    telegramId,
    planId: planId || null,
    planLabel: planLabel(planId),
    key,
    keyId: created.id || null,
    mintVia: created.via,
    baseUrl: BASE_URL,
    at: new Date().toISOString(),
  });
  if (telegramId && typeof sendTelegram === 'function') {
    await sendTelegram(telegramId, msg);
  }
  return { key, file, msg, via: created.via, planId };
}

module.exports = {
  fulfillMembership,
  mintKey,
  createOmniRouteKey,
  deliveryMessage,
  PLAN_ID,
  PIONEER_PLAN,
  STARTER_PLAN,
  PRO_PLAN,
  ALLOWED_PLANS,
  isAllowedPlan,
  planLabel,
};
