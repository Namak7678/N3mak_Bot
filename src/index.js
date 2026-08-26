require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const { initDb } = require('./db');
const { checkRateLimit } = require('./redis');
const { registerCommands } = require('./commands');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL; // e.g. https://n3mak-api-production.up.railway.app

if (!BOT_TOKEN) {
  console.error('[fatal] TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Rate limiting middleware (anti-flood)
bot.use(async (ctx, next) => {
  if (ctx.from) {
    const allowed = await checkRateLimit(ctx.from.id);
    if (!allowed) return; // silently drop
  }
  return next();
});

registerCommands(bot);

const app = express();
// NOTE: no global express.json() here — Telegraf's webhookCallback()
// needs to read the raw request body itself to parse incoming Telegram
// updates. Adding a global JSON body-parser consumed the stream first,
// which meant Telegram always got a 200 OK but the bot never actually
// saw the message. None of our own routes need a parsed body.

app.get('/', (_req, res) => res.send('N3mak bot server is running.'));
app.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok' }));

// Webhook route is mounted before listen() so it's ready even if
// setWebhook() (a network call to Telegram) hasn't resolved yet.
if (PUBLIC_URL) {
  const webhookPath = `/webhook/${BOT_TOKEN}`;
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
  const webhookPath = `/webhook/${BOT_TOKEN}`;
  connectWithRetry('webhook', () => bot.telegram.setWebhook(`${PUBLIC_URL}${webhookPath}`));
} else {
  bot.launch();
  console.log('[bot] running in polling mode (set PUBLIC_URL to enable webhook mode)');
}

process.once('uncaughtException', (err) => console.error('[uncaughtException]', err));
process.once('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });
