/**
 * Whop Standard Webhooks verification.
 * Signs: `{webhook-id}.{webhook-timestamp}.{rawBody}` with HMAC-SHA256.
 * Key: literal WHOP_WEBHOOK_SECRET (`ws_...`) — do not strip prefix or base64-decode.
 * Header: webhook-signature = `v1,<base64>`
 * Reject timestamps older/newer than 5 minutes.
 */
const crypto = require('crypto');

const TOLERANCE_SEC = 5 * 60;

function getHeader(headers, name) {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  if (typeof headers.get === 'function') return headers.get(name) || headers.get(lower);
  return headers[name] || headers[lower] || headers[name.toLowerCase()];
}

function verifyWhopSignature(rawBody, headers, secret) {
  if (!secret || !String(secret).trim()) {
    const err = new Error('WHOP_WEBHOOK_SECRET is not set — copy the signing secret from the Whop dashboard Developer → Webhooks');
    err.code = 'WHOP_SECRET_MISSING';
    err.status = 401;
    throw err;
  }
  const id = getHeader(headers, 'webhook-id');
  const ts = getHeader(headers, 'webhook-timestamp');
  const sigHeader = getHeader(headers, 'webhook-signature');
  if (!id || !ts || !sigHeader) {
    const err = new Error('missing webhook-id, webhook-timestamp, or webhook-signature');
    err.code = 'WHOP_SIG_MISSING';
    err.status = 401;
    throw err;
  }
  if (!/^\d+$/.test(String(ts))) {
    const err = new Error('invalid webhook-timestamp');
    err.code = 'WHOP_SIG_BAD_TS';
    err.status = 401;
    throw err;
  }
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (age > TOLERANCE_SEC) {
    const err = new Error('webhook-timestamp outside 5-minute tolerance');
    err.code = 'WHOP_SIG_STALE';
    err.status = 401;
    throw err;
  }
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  const expected = crypto.createHmac('sha256', String(secret)).update(`${id}.${ts}.${body}`).digest('base64');
  const ok = String(sigHeader)
    .split(' ')
    .some((part) => {
      const [version, sig] = part.split(',');
      if (version !== 'v1' || !sig) return false;
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
  if (!ok) {
    const err = new Error('webhook signature mismatch');
    err.code = 'WHOP_SIG_MISMATCH';
    err.status = 401;
    throw err;
  }
  return { webhookId: id, timestamp: ts };
}

module.exports = { verifyWhopSignature, TOLERANCE_SEC };
