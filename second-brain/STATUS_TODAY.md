# Status — 2026-09-21

## Done previously / still live
- Whop checkouts: Pioneer $3, Starter $9 (+first9), Pro $49
- Bot `@N3mak_bot` polling on :3010 with /buy /share fulfillment
- Storefront https://n3mak-buy.vercel.app/
- OmniRoute free CFP path + Codex path verified via chat completions

## OmniRoute “disconnected” diagnosis (actual)
- Process **IS running** on `:20128`
- `/v1/chat/completions` works for `cfp/openai/gpt-oss-20b` and `codex/gpt-5.5-low`
- `/v1/models` returns **401 only with wrong key**; correct bot key → 200
- `/health` returns 404 (cosmetic Next route) — not a dead gateway
- Real gap: social publishers authenticated but zero linked accounts

## Marketing gap (actual)
- Postiz connected, **0 social integrations**
- Zernio connected, **0 accounts**
- Scheduler seeded to owner for ops broadcasts until a public channel ID is set

## Revenue
- Still $0 first paying customer
