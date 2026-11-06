# Status — 2026-09-21

## Done previously / still live
- Whop checkouts: Pioneer $3, Starter $9 (+first9), Pro $49
- Bot `@N3mak_bot` polling on :3010 with /buy /share fulfillment
- Storefront https://n3mak-buy.vercel.app/
- OmniRoute free CFP path + Codex path verified via chat completions

## OmniRoute “disconnected” diagnosis (actual)
- Process **IS running** on `:20128` (PID alive ~23h)
- `/v1/chat/completions` works for `cfp/openai/gpt-oss-20b` and `codex/gpt-5.5-low`
- `/v1/models` returns **401 only with wrong key**; correct bot key → 200
- `/health` returns 404 (cosmetic Next route) — not a dead gateway
- Real gap for “AI tools of my accounts”: ChatGPT/Claude/Kimi OAuth linking was partial; product path uses CFP+Codex without paid xAI

## Marketing gap (actual)
- Postiz connected, **0 social integrations**
- Zernio connected, **0 accounts**
- Scheduler was idle because `TELEGRAM_CHANNEL_ID` empty — now seeded to owner for ops broadcasts 06/12/18 UTC until a public channel ID is set

## Revenue
- Still $0 first paying customer
