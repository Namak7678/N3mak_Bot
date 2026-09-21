require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const { pool, initDb, creditDeposit } = require('./db');
const { checkRateLimit } = require('./redis');
const { registerCommands } = require('./commands');
const { startScheduledPosts } = require('./scheduler');
const { verifyWebhookEvent } = require('./payments');
const starsPayments = require('./starsPayments');

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

// --- Telegram Stars (XTR) payments ---
// pre_checkout_query must be answered within ~10s or the payment UI fails.
bot.on('pre_checkout_query', async (ctx) => {
  try {
    const q = ctx.preCheckoutQuery;
    const parsed = starsPayments.parsePayload(q.invoice_payload);
    const okTier =
      parsed &&
      starsPayments.findTierByUsd(parsed.usd) &&
      Number(parsed.telegramId) === Number(q.from.id) &&
      q.currency === 'XTR';
    if (!okTier) {
      console.error('[stars] rejecting pre_checkout:', {
        payload: q.invoice_payload,
        currency: q.currency,
        from: q.from?.id,
      });
      await ctx.answerPreCheckoutQuery(false, 'Invalid Stars deposit. Please try /deposit_stars again.');
      return;
    }
    await ctx.answerPreCheckoutQuery(true);
  } catch (err) {
    console.error('[stars] pre_checkout_query failed:', err.message);
    try {
      await ctx.answerPreCheckoutQuery(false, 'Payment temporarily unavailable.');
    } catch (_) {}
  }
});

bot.on('successful_payment', async (ctx) => {
  const payment = ctx.message?.successful_payment;
  if (!payment) return;
  try {
    if (payment.currency !== 'XTR') {
      console.warn('[stars] ignoring non-XTR successful_payment:', payment.currency);
      return;
    }
    const parsed = starsPayments.parsePayload(payment.invoice_payload);
    if (!parsed) {
      console.error('[stars] bad invoice_payload on successful_payment:', payment.invoice_payload);
      await ctx.reply('Payment received but could not map to a deposit tier. Contact /support with your receipt.');
      return;
    }
    const telegramId = parsed.telegramId || ctx.from.id;
    const amountUsd = parsed.usd;
    const chargeId = payment.telegram_payment_charge_id || payment.provider_payment_charge_id;
    if (!chargeId) {
      console.error('[stars] missing telegram_payment_charge_id');
      await ctx.reply('Payment received but missing charge id. Contact /support.');
      return;
    }
    const sessionKey = `stars:${chargeId}`;
    const { fee, credited, applied } = await creditDeposit(telegramId, amountUsd, sessionKey);
    if (applied) {
      await ctx.reply(
        `✅ Stars deposit confirmed (${payment.total_amount}⭐ → $${Number(amountUsd).toFixed(2)} USD tier)\n` +
          `Platform fee (2%): $${Number(fee).toFixed(2)}\n` +
          `Credited to wallet: $${Number(credited).toFixed(2)}\n\n` +
          `Use /portfolio to check your balance.`
      );
    } else {
      await ctx.reply('✅ This Stars payment was already credited. Use /portfolio to check your balance.');
    }
  } catch (err) {
    console.error('[stars] successful_payment credit failed:', err.message);
    await ctx.reply('Payment received but wallet credit failed. Contact /support — we will fix it using your Telegram receipt.');
  }
});

startScheduledPosts(bot);

const app = express();
app.use(express.static(require('path').join(__dirname, '..', 'public')));
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
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', service: 'n3mak-bot' }));
app.get('/ready', (_req, res) => res.status(200).json({ status: 'ready', service: 'n3mak-bot' }));

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
    const telegramId = Number(session.metadata?.telegram_id || session.client_reference_id);
    const amountUsd = (session.amount_total || 0) / 100;
    if (telegramId && amountUsd > 0) {
      try {
        const { fee, credited, applied } = await creditDeposit(telegramId, amountUsd, session.id);
        if (applied) {
          await bot.telegram.sendMessage(
            telegramId,
            `✅ Deposit confirmed: $${amountUsd.toFixed(2)}\n` +
            `Platform fee (2%): $${Number(fee).toFixed(2)}\n` +
            `Credited to wallet: $${Number(credited).toFixed(2)}\n\n` +
            `Use /portfolio to check your balance.`
          );
        }
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

// Whop payment fulfillment (membership activated)
try {
  const { fulfillMembership, isAllowedPlan } = require('./fulfillment/whopFulfill');
  app.post('/webhooks/whop', express.raw({ type: '*/*' }), async (req, res) => {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body);
      const action = body?.action || body?.type || '';
      const data = body?.data || body;
      const planId = data?.plan_id || data?.plan?.id || '';
      const membershipId = data?.id || data?.membership_id || data?.membership?.id;
      if (!membershipId) return res.status(200).json({ ok: true, skipped: 'no membership' });
      if (planId && !isAllowedPlan(planId)) {
        return res.status(200).json({ ok: true, skipped: 'other plan', planId });
      }
      const email = data?.email || data?.user?.email || null;
      const telegramId = Number(data?.metadata?.telegram_id || data?.telegram_id) || null;
      const result = await fulfillMembership({
        membershipId,
        email,
        telegramId,
        planId,
        sendTelegram: telegramId ? (id, msg) => bot.telegram.sendMessage(id, msg) : undefined,
      });
      console.log('[whop] fulfilled', membershipId, result.file);
      res.json({ ok: true, membershipId });
    } catch (err) {
      console.error('[whop] webhook error', err.message);
      res.status(200).json({ ok: false, error: err.message });
    }
  });
  console.log('[whop] fulfillment webhook mounted at POST /webhooks/whop');
} catch (e) {
  console.warn('[whop] fulfill mount skipped:', e.message);
}

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
