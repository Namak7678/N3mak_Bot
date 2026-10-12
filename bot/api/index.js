const { bot, BOT_TOKEN } = require('../src/bot-instance');
const { deriveTelegramWebhookSecret } = require('../src/webhook-security');

// Read-only. Never call setWebhook here: a public GET used to register the
// webhook without secret_token, which made Telegram retry updates and receive 401.
module.exports = async (_req, res) => {
  let webhook = { configured: false };
  try {
    const info = await bot.telegram.getWebhookInfo();
    webhook = {
      url: info.url || null,
      pending: info.pending_update_count ?? 0,
      lastError: info.last_error_message || null,
      hasSecret: Boolean(deriveTelegramWebhookSecret(BOT_TOKEN)),
    };
  } catch (err) {
    webhook = { ok: false, error: err.message };
  }

  res.status(200).json({
    status: 'ok',
    paths: {
      health: '/api/health',
      telegram: '/api/telegram',
      webhook: '/webhook',
      stripe: '/api/stripe-webhook',
    },
    webhook,
  });
};
