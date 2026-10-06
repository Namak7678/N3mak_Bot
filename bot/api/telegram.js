const { bot, BOT_TOKEN } = require('../src/bot-instance');
const { ensureDbReady } = require('./_init');
const { deriveTelegramWebhookSecret, hasValidTelegramWebhookSecret } = require('../src/webhook-security');
const { acknowledgeWebhook } = require('../src/webhook-response');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }
  if (!hasValidTelegramWebhookSecret(req, deriveTelegramWebhookSecret(BOT_TOKEN))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return acknowledgeWebhook(res, async () => {
    await ensureDbReady();
    await bot.handleUpdate(req.body);
  }, error => console.error('[telegram webhook] processing failed:', error?.message || 'unknown error'));
};
