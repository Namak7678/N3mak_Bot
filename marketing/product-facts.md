# N3mak AI Gateway — product facts

Sources: bot code (`bot/src/whop.js`, `bot/src/fulfillment/whopFulfill.js`, `bot/src/commands.js`), store/buy pages, Whop product page `https://whop.com/n3mak-ai-gateway`, marketing notes that repeat the same checkout IDs. Anything not stated there is marked **not defined**.

## Plans & checkout

| Plan | Price | Checkout | Plan ID |
|------|-------|----------|---------|
| Pioneer | $3 | https://whop.com/checkout/plan_n2uiwphhI5YG7 | `plan_n2uiwphhI5YG7` |
| Starter | $9 (promo code `first9` / `FIRST9` → $6) | https://whop.com/checkout/plan_IkWmnOwW1ShYY | `plan_IkWmnOwW1ShYY` |
| Pro | $49 | https://whop.com/checkout/plan_SrqGnbkktuOUc | `plan_SrqGnbkktuOUc` |

- Bot: https://t.me/N3mak_bot (`/buy`, `/pricing`, `/whop`)
- Store: https://n3mak-buy.vercel.app/ — **live AI Gateway copy confirmed 2026-11-06** (no longer the old “سوق الموارد” marketplace page)
- Whop product page still contains older wording that says “instant” — **do not repeat “instant” in new marketing**; prefer the live store timing below
- Pioneer seat / capacity limit: **not shown on the live Whop checkout** for `plan_n2uiwphhI5YG7` as of **2026-11-06** (owner check). Do **not** claim “10 seats” or any seat cap in marketing.
- **Marketing focus (2026-11-06):** promote **Pioneer $3 only**. Starter / Pro remain in the product/backend table below but are **paused in marketing** until they offer a real difference over Pioneer.

## Delivery timing (live store)

- **Live (public store copy):** the key arrives through `@N3mak_bot` **within a few hours** of payment on Whop.
- Exact Arabic on store: «يصلك المفتاح عبر @N3mak_bot خلال ساعات قليلة بعد الدفع على Whop»
- **Source:** live store page https://n3mak-buy.vercel.app/ , checked **2026-11-06**
- **Owner approved:** **2026-11-06** — marketing may state this delivery timing as live policy.
- **Never say instant / فوري**

## Per-plan limits (rate, tokens, models)

Enforced in OmniRoute at mint time (`tierLimits.js` / `mint_omni_key.py`):

| | Pioneer $3 | Starter $9 | Pro $49 |
|--|------------|------------|---------|
| `max_requests_per_day` | 200 | 1,000 | 10,000 |
| `max_requests_per_minute` | 5 | 20 | 60 |
| Models | restricted free/CFP (`cfp/*` + listed aliases) | free + mid-tier CFP list | `model_access_mode=all` |
| `daily_usage_limit_usd` | $0.50 | $3 | $20 |

- Default model in fulfillment message: `cfp/openai/gpt-oss-20b`.
- Buyer-facing model + limits page: **not published** → keep as open before-posting item.

## Refund policy

- **Live policy (owner approved 2026-11-06):** Full refund if the OmniRoute API key does not arrive within 24 hours of a confirmed Whop payment, or if a delivered key does not work (auth failure / cannot call the gateway) after the buyer contacts support with the Whop receipt and Telegram username.
- Marketing may state this refund policy as live.
- Note: may not yet be wired into bot copy, Whop product page HTML, or automated refund tooling — still the approved public promise as of 2026-11-06.

## How to upgrade from Pioneer

- Bot UI: `/buy` shows Pioneer, Starter, and Pro Whop checkout buttons; fulfillment message says `للترقية: /buy على @N3mak_bot`.
- No automated in-app upgrade/proration path: **not defined** (buyer opens the higher Whop checkout).
- Marketing PLAN.md mentions “ترقية من Pioneer إلى Pro” as a follow-up action; no technical upgrade webhook beyond buying another plan.

## Fulfillment (as implemented)

- Endpoint: `POST /webhooks/whop` on the bot.
- Allowed plan IDs: Pioneer + Starter + Pro (above). Disallowed: `plan_UKIjanDMOoEGV`.
- Delivery mechanism: mint OmniRoute key → Telegram DM only if `telegram_id` is present in Whop metadata; otherwise key is recorded under `/tmp/n3mak-fulfillments/`.
- Public timing claim for buyers: use the **live store** wording (within a few hours via @N3mak_bot) — never “instant”.
- Public webhook reachability requires a live `PUBLIC_URL` / Whop webhook target; a dead Cloudflare tunnel URL does not receive events.

## Assets

- Logo: `/workspace/N3mak_Bot/marketing/assets/logo-512.png`
- Store screenshot (current): `/workspace/N3mak_Bot/marketing/assets/store-home.png`
- Previous screenshot kept as: `/workspace/N3mak_Bot/marketing/assets/store-home-old.png`
- Maker identity: **N3mak team** (no personal names)
