require('dotenv').config();
const express = require('express');
const { initDb, creditDeposit } = require('./db');
const { bot } = require('./bot-instance');
const { startScheduledPosts } = require('./scheduler');
const { verifyWebhookEvent } = require('./payments');
const { deriveTelegramWebhookSecret, hasValidTelegramWebhookSecret } = require('./webhook-security');

const PORT = process.env.PORT || 3000;
const PUBLIC_URL = String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
const WEBHOOK_SECRET = deriveTelegramWebhookSecret(process.env.TELEGRAM_BOT_TOKEN);

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('[fatal] TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

startScheduledPosts(bot);

const app = express();

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.header('Access-Control-Allow-Origin', '*');
  }
  next();
});

app.get('/', (_req, res) => res.send('N3mak bot server is running.'));
app.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok' }));

app.get('/api/stats', async (_req, res) => {
  try {
    const usersResult = await require('./db').pool.query('SELECT COUNT(*)::int AS count FROM users');
    res.status(200).json({ users: usersResult.rows[0].count, markets: 6 });
  } catch {
    res.status(200).json({ users: 0, markets: 6 });
  }
});

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = verifyWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (error) {
    console.error('[stripe webhook] signature check failed:', error.message);
    return res.status(400).send('signature verification failed');
  }

  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true });
  }

  const session = event.data.object;
  if (session.payment_status !== 'paid') {
    return res.json({ received: true, ignored: 'payment_not_paid' });
  }

  const telegramId = Number(session.metadata?.telegram_id);
  const amountUsd = Number(session.amount_total) / 100;
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0 || !session.id || !Number.isFinite(amountUsd) || amountUsd <= 0) {
    console.error('[stripe webhook] invalid paid checkout session metadata');
    return res.status(400).json({ received: false, error: 'invalid_checkout_session' });
  }

  try {
    await creditDeposit(telegramId, amountUsd, session.id);
    await bot.telegram.sendMessage(
      telegramId,
      `✅ Deposit confirmed: $${amountUsd}. Your wallet has been credited.\nUse /portfolio to check your balance.`,
    );
    return res.json({ received: true });
  } catch (error) {
    console.error('[stripe webhook] processing failed:', error.message);
    return res.status(500).json({ received: false });
  }
});

if (PUBLIC_URL) {
  const webhookPath = '/webhook';
  app.use(webhookPath, (req, res, next) => {
    if (!hasValidTelegramWebhookSecret(req, WEBHOOK_SECRET)) {
      return res.status(401).end();
    }
    return next();
  });
  app.use(bot.webhookCallback(webhookPath));
}

app.listen(PORT, () => console.log(`[server] listening on port ${PORT}`));

async function connectWithRetry(name, fn, attempt = 1) {
  try {
    await fn();
    console.log(`[${name}] ready`);
  } catch (error) {
    console.error(`[${name}] failed (attempt ${attempt}):`, error.message);
    if (attempt < 5) {
      setTimeout(() => connectWithRetry(name, fn, attempt + 1), 3000);
    } else {
      console.error(`[${name}] giving up after ${attempt} attempts — server stays up, will keep serving /api/health`);
    }
  }
}

connectWithRetry('db', initDb);

if (PUBLIC_URL) {
  const webhookPath = '/webhook';
  connectWithRetry('webhook', () => bot.telegram.setWebhook(`${PUBLIC_URL}${webhookPath}`, { secret_token: WEBHOOK_SECRET }));
} else {
  bot.launch();
  console.log('[bot] running in polling mode (set PUBLIC_URL to enable webhook mode)');
}

process.once('uncaughtException', error => console.error('[uncaughtException]', error));
process.once('unhandledRejection', error => console.error('[unhandledRejection]', error));
process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });
