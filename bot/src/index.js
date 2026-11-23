require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const { pool, initDb, creditDeposit } = require('./db');
const { checkRateLimit } = require('./redis');
const { registerCommands } = require('./commands');
const { registerRealtorFlow } = require('./realtor-lead'); // ADR-011: /realtor property lead intake
const { startScheduledPosts } = require('./scheduler');
const { startTrialNudges } = require('./trial/nudge');
const { startHqReporter } = require('./hq-reporter'); // D14: 09:00/20:00 UTC into topics
const { verifyWebhookEvent } = require('./payments');
const starsPayments = require('./starsPayments');
const blueprints = require('./blueprints');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PORT = process.env.PORT || 3010;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '') || undefined; // e.g. https://n3mak-bot-production.up.railway.app
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
// down, slow, or simply not configured, we let the message through rather
// than blocking every command in the bot on an infrastructure hiccup.
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
// ADR-011: /realtor flow. Registered AFTER commands so command handlers
// win; its bot.on('text') middleware passes through via next() when the
// user has no active realtor session — zero impact on existing behavior.
registerRealtorFlow(bot);
