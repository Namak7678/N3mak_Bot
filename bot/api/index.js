const { bot } = require('../src/bot-instance');

let webhookPromise = null;

function publicBase() {
  return String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
}

async function ensureWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const base = publicBase();
  if (!token || !base) return { skipped: true, reason: 'missing PUBLIC_URL or token' };
  const url = `${base}/api/telegram`;
  if (!webhookPromise) {
    webhookPromise = (async () => {
      await bot.telegram.setWebhook(url);
      const info = await bot.telegram.getWebhookInfo();
      return {
        url: info.url || url,
        pending: info.pending_update_count,
        lastError: info.last_error_message || null,
      };
    })().catch((err) => {
      webhookPromise = null;
      throw err;
    });
  }
  return webhookPromise;
}

module.exports = async (_req, res) => {
  let webhook = { skipped: true };
  try {
    webhook = await ensureWebhook();
  } catch (err) {
    webhook = { ok: false, error: err.message };
  }
  res.status(200).json({ status: 'ok', paths: {
    health: '/api/health',
    telegram: '/api/telegram',
    webhook: '/webhook',
    stripe: '/api/stripe-webhook',
  }, webhook });
};
