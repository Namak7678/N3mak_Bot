const { verifyWebhookEvent } = require('../src/payments');
const { creditDeposit } = require('../src/db');
const { bot } = require('../src/bot-instance');
const { ensureDbReady } = require('./_init');
const { acknowledgeWebhook } = require('../src/webhook-response');

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    console.error('[stripe webhook] body read failed:', error?.message || 'unknown error');
    return res.status(500).json({ received: false });
  }

  let event;
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).send('Missing Stripe signature');
    }
    event = verifyWebhookEvent(rawBody, Array.isArray(signature) ? signature[0] : signature);
  } catch (error) {
    console.error('[stripe webhook] signature check failed:', error?.message || 'unknown error');
    return res.status(400).send('signature verification failed');
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  if (session.payment_status !== 'paid') {
    return res.status(200).json({ received: true, ignored: 'payment_not_paid' });
  }

  const telegramId = Number(session.metadata?.telegram_id);
  const amountUsd = Number(session.amount_total) / 100;
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0 || !session.id || !Number.isFinite(amountUsd) || amountUsd <= 0) {
    console.error('[stripe webhook] invalid paid checkout session metadata');
    return res.status(400).json({ received: false, error: 'invalid_checkout_session' });
  }

  return acknowledgeWebhook(
    res,
    async () => {
      await ensureDbReady();
      await creditDeposit(telegramId, amountUsd, session.id);
      await bot.telegram.sendMessage(
        telegramId,
        `✅ Deposit confirmed: $${amountUsd}. Your wallet has been credited.\nUse /portfolio to check your balance.`,
      );
    },
    error => console.error('[stripe webhook] processing failed:', error?.message || 'unknown error'),
  );
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
