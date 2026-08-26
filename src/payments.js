const Stripe = require('stripe');

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const DEPOSIT_AMOUNTS_USD = [25, 50, 100];

function isConfigured() {
  return !!stripe;
}

async function createDepositSession(amountUsd, telegramId) {
  const successUrl = `${process.env.PUBLIC_URL || 'https://t.me'}/deposit-success`;
  const cancelUrl = `${process.env.PUBLIC_URL || 'https://t.me'}/deposit-cancelled`;

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

module.exports = { isConfigured, createDepositSession, DEPOSIT_AMOUNTS_USD };
