const DEPOSIT_AMOUNTS_STARS = Object.freeze([
  Object.freeze({ stars: 100, usd: 25, label: '100⭐ — $25' }),
  Object.freeze({ stars: 250, usd: 50, label: '250⭐ — $50' }),
  Object.freeze({ stars: 500, usd: 100, label: '500⭐ — $100' }),
]);

function isConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

function findTierByUsd(usd) {
  const amount = Number(usd);
  return DEPOSIT_AMOUNTS_STARS.find(tier => tier.usd === amount) || null;
}

function findTierByStars(stars) {
  const amount = Number(stars);
  return DEPOSIT_AMOUNTS_STARS.find(tier => tier.stars === amount) || null;
}

function parsePayload(payload) {
  const match = /^n3mak:wallet:(\\d+):(\\d+)$/.exec(String(payload || ''));
  if (!match) return null;
  const telegramId = Number(match[1]);
  const tier = findTierByUsd(Number(match[2]));
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0 || !tier) return null;
  return { telegramId, usd: tier.usd };
}

function validatePayment(payload, telegramId, totalAmount) {
  const parsed = parsePayload(payload);
  if (!parsed) return null;
  const tier = findTierByUsd(parsed.usd);
  if (!tier || Number(parsed.telegramId) !== Number(telegramId) || Number(totalAmount) !== tier.stars) {
    return null;
  }
  return { ...parsed, stars: tier.stars };
}

async function createStarsInvoiceLink(telegram, _chatId, amountStars, telegramId) {
  if (!isConfigured()) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  if (!telegram || typeof telegram.createInvoiceLink !== 'function') {
    throw new TypeError('Telegram client must provide createInvoiceLink()');
  }
  const tier = findTierByStars(amountStars);
  if (!tier) throw new RangeError('Unsupported Telegram Stars deposit tier');
  const id = Number(telegramId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new TypeError('A valid Telegram user ID is required');

  const payload = `n3mak:wallet:${id}:${tier.usd}`;
  return telegram.createInvoiceLink(
    'N3mak Wallet Deposit',
    `${tier.stars} Telegram Stars wallet deposit ($${tier.usd} USD before platform fee)`,
    payload,
    '',
    'XTR',
    [{ label: `$${tier.usd} wallet deposit`, amount: tier.stars }],
  );
}

module.exports = {
  DEPOSIT_AMOUNTS_STARS,
  isConfigured,
  findTierByUsd,
  findTierByStars,
  parsePayload,
  validatePayment,
  createStarsInvoiceLink,
};
