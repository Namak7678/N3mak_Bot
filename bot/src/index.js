require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const { pool, initDb, creditDeposit } = require('./db');
const { checkRateLimit } = require('./redis');
const { registerCommands } = require('./commands');
const { startScheduledPosts } = require('./scheduler');
const { verifyWebhookEvent } = require('./payments');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL; // e.g. https://n3mak-api-production.up.railway.app
// A separate, URL-safe secret for the webhook path — the raw bot token
// contains a ':' which can get inconsistently encoded/decoded between
// what Telegram registers and what Express actually receives, silently
// breaking exact-path matching. A plain alphanumeric secret avoids that
// class of bug entirely.
const WEBHOOK_SECRET = (process.env.WEBHOOK_SECRET || BOT_TOKEN || '').replace(/[^a-zA-Z0-9]/g, '');

if (!BOT_TOKEN) {
  console.error('[fatal] TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

bot.use(async (ctx, next) => {
  console.log(`[update] ${ctx.updateType} from ${ctx.from?.id || ctx.chat?.id || 'unknown'}`);
  return next();
});

// Rate limiting middleware (anti-flood) — fails OPEN: if Redis is
// down or slow, we let the message through rather than blocking every
// command in the bot on an infrastructure hiccup.
bot.use(async (ctx, next) => {
  if (ctx.from) {
    try {
      const allowed = await checkRateLimit(ctx.from.id);
      if (!allowed) return; // silently drop actual flood
    } catch (err) {
      console.error('[ratelimit] check failed, allowing message through:', err.message);
    }
  }
  return next();
});

registerCommands(bot);
startScheduledPosts(bot);

const app = express();
// NOTE: no global express.json() here — Telegraf's webhookCallback()
// needs to read the raw request body itself to parse incoming Telegram
// updates. Adding a global JSON body-parser consumed the stream first,
// which meant Telegram always got a 200 OK but the bot never actually
// saw the message. None of our own routes need a parsed body.

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
    const { pool } = require('./db');
    const usersResult = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    res.status(200).json({
      users: usersResult.rows[0].count,
      markets: 6,
    });
  } catch (err) {
    res.status(200).json({ users: 0, markets: 6 });
  }
});

// Stripe webhook needs the RAW body to verify the signature — express.raw()
// is scoped to only this one path, so it never touches Telegraf's own
// webhook route or anything else.
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = verifyWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    console.error('[stripe webhook] signature check failed:', err.message);
    return res.status(400).send('signature verification failed');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const telegramId = Number(session.metadata?.telegram_id);
    const amountUsd = session.amount_total / 100;
    if (telegramId) {
      try {
        await creditDeposit(telegramId, amountUsd, session.id);
        await bot.telegram.sendMessage(
          telegramId,
          `✅ Deposit confirmed: $${amountUsd}. Your wallet has been credited.\nUse /portfolio to check your balance.`
        );
      } catch (err) {
        console.error('[stripe webhook] credit failed:', err.message);
      }
    }
  }
  res.json({ received: true });
});

// Webhook route is mounted before listen() so it's ready even if
// setWebhook() (a network call to Telegram) hasn't resolved yet.
if (PUBLIC_URL) {
  const webhookPath = `/webhook/${WEBHOOK_SECRET}`;
  app.use(bot.webhookCallback(webhookPath));
}

// Start listening immediately so Railway's healthcheck passes and the
// service is never marked crashed just because a dependency is slow/down.
app.listen(PORT, () => console.log(`[server] listening on port ${PORT}`));

async function connectWithRetry(name, fn, attempt = 1) {
  try {
    await fn();
    console.log(`[${name}] ready`);
  } catch (err) {
    console.error(`[${name}] failed (attempt ${attempt}):`, err.message);
    if (attempt < 5) {
      setTimeout(() => connectWithRetry(name, fn, attempt + 1), attempt * 3000);
    } else {
      console.error(`[${name}] giving up after ${attempt} attempts — server stays up, will keep serving /api/health`);
    }
  }
}

connectWithRetry('db', initDb);

if (PUBLIC_URL) {
  const webhookPath = `/webhook/${WEBHOOK_SECRET}`;
  connectWithRetry('webhook', () => bot.telegram.setWebhook(`${PUBLIC_URL}${webhookPath}`));
} else {
  bot.launch();
  console.log('[bot] running in polling mode (set PUBLIC_URL to enable webhook mode)');
}

process.once('uncaughtException', (err) => console.error('[uncaughtException]', err));
process.once('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });
