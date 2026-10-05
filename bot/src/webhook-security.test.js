const test = require('node:test');
const assert = require('node:assert/strict');
const { hasValidTelegramWebhookSecret, isAuthorizedSetupRequest } = require('./webhook-security');

test('Telegram webhook requires a matching provider secret header', () => {
  const expected = 'unit-test-webhook-secret';
  assert.equal(hasValidTelegramWebhookSecret({ headers: { 'x-telegram-bot-api-secret-token': expected } }, expected), true);
  assert.equal(hasValidTelegramWebhookSecret({ headers: {} }, expected), false);
  assert.equal(hasValidTelegramWebhookSecret({ headers: { 'x-telegram-bot-api-secret-token': 'wrong' } }, expected), false);
});

test('setup endpoint accepts matching headers and never accepts query credentials', () => {
  const expected = 'unit-test-setup-secret';
  assert.equal(isAuthorizedSetupRequest({ headers: { 'x-setup-secret': expected } }, expected), true);
  assert.equal(isAuthorizedSetupRequest({ headers: { authorization: 'Bearer ' + expected } }, expected), true);
  assert.equal(isAuthorizedSetupRequest({ headers: {}, query: { secret: expected } }, expected), false);
  assert.equal(isAuthorizedSetupRequest({ headers: { 'x-setup-secret': 'wrong' } }, expected), false);
  assert.equal(isAuthorizedSetupRequest({ headers: { 'x-setup-secret': expected } }, ''), false);
});
