const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyWhopSignature } = require('./whopVerify');

const secret = 'ws_test_signing_secret';

function signedHeaders(body, overrides = {}) {
  const id = 'msg_test_123';
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac('sha256', secret)
    .update(`${id}.${ts}.${body}`)
    .digest('base64');
  return {
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': `v1,${signature}`,
    ...overrides,
  };
}

test('accepts a valid Whop Standard Webhooks signature', () => {
  const body = JSON.stringify({ type: 'membership.activated' });
  const result = verifyWhopSignature(Buffer.from(body), signedHeaders(body), secret);
  assert.equal(result.webhookId, 'msg_test_123');
});

test('rejects a missing signing secret', () => {
  assert.throws(() => verifyWhopSignature('{}', {}, ''), { code: 'WHOP_SECRET_MISSING', status: 401 });
});

test('rejects a stale webhook timestamp', () => {
  const body = '{}';
  const headers = signedHeaders(body, { 'webhook-timestamp': '1' });
  assert.throws(() => verifyWhopSignature(body, headers, secret), { code: 'WHOP_SIG_STALE', status: 401 });
});

test('rejects a modified body or invalid signature', () => {
  const body = '{}';
  assert.throws(() => verifyWhopSignature('{"tampered":true}', signedHeaders(body), secret), {
    code: 'WHOP_SIG_MISMATCH',
    status: 401,
  });
});

test('rejects missing signature headers', () => {
  assert.throws(() => verifyWhopSignature('{}', { 'webhook-id': 'msg_1' }, secret), {
    code: 'WHOP_SIG_MISSING',
    status: 401,
  });
});
