# Running N3mak_Bot on Vercel (free tier)

This is the free, no-credit-card alternative to the original Railway
setup, used because Railway's trial expired. Trade-offs vs. Railway:

- **Webhook mode only** — there's no persistent process to long-poll, so
  `TELEGRAM_BOT_TOKEN` webhook mode is the only option here (this is
  automatic, no config needed).
- **Promo auto-posting: once/day instead of twice/day** — Vercel's Hobby
  (free) plan only allows a cron job to fire once daily. See
  `vercel.json` / `api/cron-promo.js`. Upgrading to Vercel Pro removes
  this limit if it matters later.
- **Redis (rate limiting) is optional** — the bot fails open without it.

## Required environment variables (Vercel project → Settings → Environment Variables)

- `TELEGRAM_BOT_TOKEN`
- `DATABASE_URL` (Neon connection string)
- `DB_SSL=true` (Neon requires TLS; this repo only enables it when this is set)
- `SETUP_SECRET` — required; protects the one-time webhook setup endpoint.
- `PUBLIC_URL` — canonical HTTPS URL (optional on Vercel when `VERCEL_PROJECT_PRODUCTION_URL` is available).

Optional (add later, no code changes needed):
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — enables real deposits
- `TELEGRAM_CHANNEL_ID`, `OWNER_TELEGRAM_ID`
- `REDIS_URL` — enables anti-flood rate limiting

## One-time setup after each fresh deploy

Call the endpoint once after deployment using a POST request and an authorization header. Keep `SETUP_SECRET` in the deployment environment; never put it in a URL:

    curl -X POST https://<your-deployment>.vercel.app/api/setup-webhook \
      -H "Authorization: Bearer $SETUP_SECRET"

The endpoint fails closed if `SETUP_SECRET` is missing and never trusts the incoming Host header. The Telegram webhook header is derived from `TELEGRAM_BOT_TOKEN`; public health checks do not reveal the webhook URL.

## Local/Railway path unaffected

`src/index.js` (used by Railway) still works exactly as before — polling
or webhook mode based on `PUBLIC_URL`, unchanged. The Vercel functions in
`api/` reuse the same `src/bot-instance.js`, `src/db.js`, etc., so command
logic is never duplicated.
