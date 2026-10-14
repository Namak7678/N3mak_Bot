const { bot, BOT_TOKEN } = require('../src/bot-instance');
const { activateBot } = require('../src/commands');
const { deriveTelegramWebhookSecret } = require('../src/webhook-security');

let webhookPromise = null;

function publicBase() {
  const vercelDomain = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  const configured = String(process.env.PUBLIC_URL || '').trim();
  const candidate = vercelDomain ? 'https://' + vercelDomain : configured;
  if (!candidate) return '';
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
}

async function ensureWebhook() {
  const base = publicBase();
  const secretToken = deriveTelegramWebhookSecret(BOT_TOKEN);
  if (!base || !secretToken) return { configured: false };

  const url = base + '/api/telegram';
  if (!webhookPromise) {
    webhookPromise = (async () => {
      await bot.telegram.setWebhook(url, { secret_token: secretToken });
      let commands = false;
      try {
        await activateBot(bot);
        commands = true;
      } catch (error) {
        console.error('[health] command menu failed:', error?.message || 'unknown error');
      }
      const info = await bot.telegram.getWebhookInfo();
      return {
        configured: info.url === url,
        pendingUpdateCount: info.pending_update_count ?? 0,
        commands,
      };
    })().catch(error => {
      webhookPromise = null;
      throw error;
    });
  }

  return webhookPromise;
}

module.exports = async (_req, res) => {
  let webhook = { configured: false };
  try {
    webhook = await ensureWebhook();
  } catch (error) {
    console.error('[health] webhook check failed:', error?.message || 'unknown error');
    webhook = { configured: false, error: 'webhook_check_failed' };
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
