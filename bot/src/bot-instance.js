// Shared Telegraf bot construction, used by BOTH:
//   - src/index.js  (Railway: long-running process, polling or webhook)
//   - api/*.js      (Vercel: serverless, webhook-only)
// Keeping this in one place means the command/middleware logic is never
// duplicated or allowed to drift between the two deployment targets.
const { Telegraf } = require('telegraf');
const { checkRateLimit } = require('./redis');
const { registerCommands } = require('./commands');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('[fatal] TELEGRAM_BOT_TOKEN is not set');
}

const bot = new Telegraf(BOT_TOKEN);

bot.use(async (ctx, next) => {
  console.log(`[update] ${ctx.updateType} from ${ctx.from?.id || ctx.chat?.id || 'unknown'}`);
  return next();
});

// Rate limiting middleware (anti-flood) — fails OPEN: if Redis is down,
// slow, or simply not configured, we let the message through rather than
// blocking every command on an infrastructure hiccup.
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

module.exports = { bot, BOT_TOKEN };
