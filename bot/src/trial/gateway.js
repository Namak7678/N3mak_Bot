/**
 * Client for n3mak-gateway admin trial endpoints.
 */
const fs = require('fs');

const PIONEER_CHECKOUT = 'https://whop.com/checkout/plan_n2uiwphhI5YG7';

function gatewayBase() {
  return (process.env.N3MAK_GATEWAY_URL || process.env.OMNIROUTE_PUBLIC_BASE_URL || 'https://n3mak-gateway.n3mak.workers.dev')
    .replace(/\/v1\/?$/, '')
    .replace(/\/$/, '');
}

function adminToken() {
  const direct = (process.env.N3MAK_GATEWAY_ADMIN_TOKEN || '').trim();
  if (direct) return direct;
  const file = (process.env.N3MAK_GATEWAY_ADMIN_TOKEN_FILE || '').trim();
  if (file && fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const fallback = '/workspace/N3mak_Bot/secrets/n3mak-gateway.admin-token';
  if (fs.existsSync(fallback)) return fs.readFileSync(fallback, 'utf8').trim();
  return '';
}

async function adminFetch(path, { method = 'GET', body } = {}) {
  const token = adminToken();
  if (!token) throw new Error('N3MAK_GATEWAY_ADMIN_TOKEN missing');
  const url = `${gatewayBase()}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, ok: res.ok, data };
}

async function mintTrial({ telegramId, test = false, label = null }) {
  return adminFetch('/admin/mint', {
    method: 'POST',
    body: {
      plan: 'trial',
      telegram_id: String(telegramId),
      test: !!test,
      label: label || (test ? 'TEST trial' : 'trial'),
      notify: false,
    },
  });
}

async function listNudgePending() {
  return adminFetch('/admin/trials/nudge-pending');
}

async function markNudged(keyIds) {
  const ids = Array.isArray(keyIds) ? keyIds : [keyIds];
  return adminFetch('/admin/trials/nudge-mark', {
    method: 'POST',
    body: { key_ids: ids },
  });
}

function pioneerCheckoutUrl() {
  return (process.env.WHOP_PIONEER_CHECKOUT_URL || '').trim() || PIONEER_CHECKOUT;
}

function publicBaseUrl(fromMint) {
  if (fromMint && fromMint.base_url) return String(fromMint.base_url).replace(/\/$/, '');
  const env = (process.env.OMNIROUTE_PUBLIC_BASE_URL || '').trim();
  if (env) return env.replace(/\/$/, '');
  return `${gatewayBase()}/v1`;
}

module.exports = {
  gatewayBase,
  adminToken,
  mintTrial,
  listNudgePending,
  markNudged,
  pioneerCheckoutUrl,
  publicBaseUrl,
  PIONEER_CHECKOUT,
};
