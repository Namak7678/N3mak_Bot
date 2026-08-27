const Stripe = require('stripe');

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const DEPOSIT_AMOUNTS_USD = [25, 50, 100];

function isConfigured() {
  return !!stripe;
}

function verifyWebhookEvent(rawBody, signature) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET not set');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

async function createDepositSession(amountUsd, telegramId) {
  const successUrl = 'https://t.me/N3mak_bot?start=deposit_ok';
  const cancelUrl = 'https://t.me/N3mak_bot?start=deposit_cancelled';

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: 'N3mak Wallet Deposit' },
          unit_amount: amountUsd * 100,
        },
        quantity: 1,
      },
    ],
    metadata: { telegram_id: String(telegramId) },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  return session.url;
}

module.exports = { isConfigured, createDepositSession, verifyWebhookEvent, DEPOSIT_AMOUNTS_USD };
