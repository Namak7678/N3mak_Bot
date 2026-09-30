// Stripe needs the exact raw request body to verify its signature, so the
// default Vercel JSON body-parser is disabled for this function only.
const { verifyWebhookEvent } = require('../src/payments');
const { creditDeposit } = require('../src/db');
const { bot } = require('../src/bot-instance');
const { ensureDbReady } = require('./_init');

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }
  const rawBody = await readRawBody(req);
  let event;
  try {
    event = verifyWebhookEvent(rawBody, req.headers['stripe-signature']);
  } catch (err) {
    console.error('[stripe webhook] signature check failed:', err.message);
    res.status(400).send('signature verification failed');
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const telegramId = Number(session.metadata?.telegram_id);
    const amountUsd = session.amount_total / 100;
    if (telegramId) {
      try {
        await ensureDbReady();
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
  res.status(200).json({ received: true });
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
