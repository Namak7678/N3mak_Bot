const { bot, BOT_TOKEN } = require('../src/bot-instance');
const { deriveTelegramWebhookSecret } = require('../src/webhook-security');

// Health endpoints must be read-only. Never register or mutate Telegram's
// webhook as a side effect of a public GET request.
module.exports = async (_req, res) => {
  let webhook = { ok: false };
  try {
    const info = await bot.telegram.getWebhookInfo();
    webhook = {
      url: info.url || null,
      pending: info.pending_update_count ?? 0,
      lastError: info.last_error_message || null,
      hasSecret: Boolean(deriveTelegramWebhookSecret(BOT_TOKEN)),
    };
  } catch (error) {
    webhook = { ok: false, error: 'webhook_status_unavailable' };
    console.error('[health] webhook status failed:', error?.message || 'unknown error');
  }

  return res.status(200).json({
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
