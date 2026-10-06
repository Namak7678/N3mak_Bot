const { bot, BOT_TOKEN } = require('../src/bot-instance');
const { deriveTelegramWebhookSecret, isAuthorizedSetupRequest } = require('../src/webhook-security');

function publicBaseUrl() {
  const vercelDomain = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  const configured = String(process.env.PUBLIC_URL || '').trim();
  const candidate = vercelDomain ? 'https://' + vercelDomain : configured;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const setupSecret = process.env.SETUP_SECRET;
  if (!setupSecret) {
    return res.status(503).json({ error: 'setup_not_configured' });
  }

  if (!isAuthorizedSetupRequest(req, setupSecret)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const base = publicBaseUrl();
  if (!base) {
    return res.status(503).json({ error: 'public_url_not_configured' });
  }

  const webhookSecret = deriveTelegramWebhookSecret(BOT_TOKEN);
  if (!webhookSecret) {
    return res.status(503).json({ error: 'bot_not_configured' });
  }

  try {
    const url = base + '/api/telegram';
    await bot.telegram.setWebhook(url, { secret_token: webhookSecret });
    const info = await bot.telegram.getWebhookInfo();
    return res.status(200).json({
      ok: true,
      configured: info.url === url,
      pendingUpdateCount: info.pending_update_count ?? 0,
    });
  } catch (error) {
    console.error('[setup-webhook] failed:', error?.message || 'unknown error');
    return res.status(500).json({ ok: false, error: 'webhook_setup_failed' });
  }
};
