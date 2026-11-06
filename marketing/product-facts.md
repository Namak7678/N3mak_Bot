# N3mak AI Gateway — product facts

Sources: bot code (`bot/src/whop.js`, `bot/src/fulfillment/whopFulfill.js`, `bot/src/commands.js`), store/buy pages, Whop product page `https://whop.com/n3mak-ai-gateway`, marketing notes that repeat the same checkout IDs. Anything not stated there is marked **not defined**.

## Plans & checkout

| Plan | Price | Checkout | Plan ID |
|------|-------|----------|---------|
| Pioneer | $3 | https://whop.com/checkout/plan_n2uiwphhI5YG7 | `plan_n2uiwphhI5YG7` |
| Starter | $9 (promo code `first9` / `FIRST9` → $6) | https://whop.com/checkout/plan_IkWmnOwW1ShYY | `plan_IkWmnOwW1ShYY` |
| Pro | $49 | https://whop.com/checkout/plan_SrqGnbkktuOUc | `plan_SrqGnbkktuOUc` |

- Bot: https://t.me/N3mak_bot (`/buy`, `/pricing`, `/whop`)
- Store: https://n3mak-buy.vercel.app/
- Whop product page copy: “multi-model API with instant Telegram key delivery after Whop checkout”
- Pioneer seat count mentioned on Whop/marketing: **10 seats** (marketing/Whop posts; not enforced in bot code)

## Per-plan limits (rate, tokens, models)

- **not defined** in bot fulfillment: Pioneer / Starter / Pro all go through the same `fulfillMembership` path and receive an OmniRoute API key with the same scopes (`self:usage`); no quota, RPM, or model allow-list differs by plan in code.
- Default model string delivered in the fulfillment message: `cfp/openai/gpt-oss-20b` (also “أو أي نموذج متاح عبر OmniRoute” / Codex via OmniRoute mentioned in older copy).
- Exact catalog of sellable models per plan: **not defined** (OmniRoute exposes many models to a valid key; plan pages do not list a fixed set).

## Refund policy

- **Live / published today:** **not defined** in code, bot copy, buy.html, or the Whop product page HTML inspected for this doc.
- **PROPOSED, pending owner approval** (do not publish as live policy until approved):
  - Full refund if the OmniRoute API key is not delivered within 24 hours of a confirmed Whop payment.
  - Full refund if a delivered key does not work (auth failure / cannot call the gateway) after the buyer contacts support with the Whop receipt and Telegram username.
  - Not yet wired into bot copy, Whop product page, or automated refund tooling.

## How to upgrade from Pioneer

- Bot UI: `/buy` shows Pioneer, Starter, and Pro Whop checkout buttons; fulfillment message says `للترقية: /buy على @N3mak_bot`.
- No automated in-app upgrade/proration path: **not defined** (buyer opens the higher Whop checkout).
- Marketing PLAN.md mentions “ترقية من Pioneer إلى Pro” as a follow-up action; no technical upgrade webhook beyond buying another plan.

## Fulfillment (as implemented)

- Endpoint: `POST /webhooks/whop` on the bot.
- Allowed plan IDs: Pioneer + Starter + Pro (above). Disallowed: `plan_UKIjanDMOoEGV`.
- Delivery: mint OmniRoute key → Telegram DM only if `telegram_id` is present in Whop metadata; otherwise key is recorded under `/tmp/n3mak-fulfillments/`.
- Public webhook reachability requires a live `PUBLIC_URL` / Whop webhook target; a dead Cloudflare tunnel URL does not receive events.
