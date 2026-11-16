const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TELEGRAM_BOT_TOKEN = 'unit-test-token';
const payments = require('./starsPayments');

test('Stars tiers map to the advertised USD amounts', () => {
  assert.equal(payments.findTierByStars(100).usd, 25);
  assert.equal(payments.findTierByStars(250).usd, 50);
  assert.equal(payments.findTierByStars(500).usd, 100);
  assert.equal(payments.findTierByUsd(50).stars, 250);
  assert.equal(payments.findTierByStars(99), null);
});

test('Stars invoice binds the payload to the intended Telegram user', async () => {
  let args;
  const url = await payments.createStarsInvoiceLink(
    { createInvoiceLink: async (...values) => { args = values; return 'https://t.me/invoice/test'; } },
    123,
    100,
    987654321,
  );
  assert.equal(url, 'https://t.me/invoice/test');
  assert.equal(args[3], '');
  assert.equal(args[4], 'XTR');
  assert.equal(args[5][0].amount, 100);
  assert.deepEqual(payments.parsePayload(args[2]), { telegramId: 987654321, usd: 25 });
});

test('Stars payload rejects malformed users and unsupported tiers', () => {
  assert.equal(payments.parsePayload('bad'), null);
  assert.equal(payments.parsePayload('n3mak:wallet:0:25'), null);
  assert.equal(payments.parsePayload('n3mak:wallet:123:30'), null);
});

test('Stars validation rejects a different payer or a mismatched XTR amount', () => {
  const payload = 'n3mak:wallet:987654321:25';
  assert.deepEqual(payments.validatePayment(payload, 987654321, 100), {
    telegramId: 987654321, usd: 25, stars: 100,
  });
  assert.equal(payments.validatePayment(payload, 111, 100), null);
  assert.equal(payments.validatePayment(payload, 987654321, 1), null);
});
