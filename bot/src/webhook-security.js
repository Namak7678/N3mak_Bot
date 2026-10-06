const { createHmac, timingSafeEqual } = require('node:crypto');

function safeEqual(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string' || !expected || !provided) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

function headerValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function deriveTelegramWebhookSecret(botToken) {
  if (typeof botToken !== 'string' || !botToken) return '';
  return createHmac('sha256', botToken).update('n3mak/telegram-webhook/v1').digest('hex');
}

function hasValidTelegramWebhookSecret(req, expectedSecret) {
  return safeEqual(expectedSecret, headerValue(req?.headers?.['x-telegram-bot-api-secret-token']));
}

function isAuthorizedSetupRequest(req, expectedSecret) {
  const headers = req?.headers || {};
  const direct = headerValue(headers['x-setup-secret']);
  const authorization = headerValue(headers.authorization);
  const bearer = typeof authorization === 'string' ? authorization.match(/^Bearer\s+(.+)$/i)?.[1] : undefined;
  return safeEqual(expectedSecret, direct || bearer);
}

module.exports = { deriveTelegramWebhookSecret, hasValidTelegramWebhookSecret, isAuthorizedSetupRequest };
