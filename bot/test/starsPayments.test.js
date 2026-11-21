const test = require('node:test');
const assert = require('node:assert/strict');
const starsPayments = require('../src/starsPayments');

test('parses the exact Telegram Stars wallet invoice payload', () => {
  assert.deepEqual(starsPayments.parsePayload('n3mak:wallet:123456:25'), {
    telegramId: 123456,
    usd: 25,
  });
});

test('rejects unsupported amounts and malformed Telegram IDs', () => {
  assert.equal(starsPayments.parsePayload('n3mak:wallet:123456:999'), null);
  assert.equal(starsPayments.parsePayload('n3mak:wallet:abc:25'), null);
});
