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
app.use(express.json());

app.get('/', (_req, res) => res.send('N3mak bot server is running.'));
app.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok' }));

async function start() {
  await initDb();

  if (PUBLIC_URL) {
    // Webhook mode (recommended for production / Railway)
    const webhookPath = `/webhook/${BOT_TOKEN}`;
    app.use(bot.webhookCallback(webhookPath));
    await bot.telegram.setWebhook(`${PUBLIC_URL}${webhookPath}`);
    console.log(`[bot] webhook set to ${PUBLIC_URL}${webhookPath}`);
  } else {
    // Fallback: long polling (fine for local dev, not for scale)
    bot.launch();
    console.log('[bot] running in polling mode (set PUBLIC_URL to enable webhook mode)');
  }

  app.listen(PORT, () => console.log(`[server] listening on port ${PORT}`));
}

start().catch((err) => {
  console.error('[fatal] startup failed:', err);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
