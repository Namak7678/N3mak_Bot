# Manual Whop fulfillment runbook

Use this for purchases without a Telegram id, or if the Whop webhook isn't configured yet.
Never paste API keys into group chats. Prefer DM via `@N3mak_bot`.

## 0) Preconditions

- Gateway up: `curl https://n3mak-gateway.n3mak.workers.dev/health` → `ok:true` (box services not required for buyer keys).
- Buyer must have pressed `/start` on `@N3mak_bot` before a Telegram DM works.
- Owner chat id (ops): `320423744`. Official email: `N3mak.team@proton.me`.


## Public BASE_URL (critical)

Buyers get **`https://n3mak-gateway.n3mak.workers.dev/v1`** (Cloudflare Worker `n3mak-gateway`, source `gateway-worker/`). It runs on Cloudflare, not on the box, so keys work even if the box is down. Never send `127.0.0.1`.

- Keys: `n3k_…`, minted by the Worker (`/admin/mint`), stored hashed in D1, per-plan RPD/RPM/models enforced.
- Whop webhook URL: `https://n3mak-gateway.n3mak.workers.dev/webhooks/whop` — needs Worker secret `WHOP_WEBHOOK_SECRET` (`ws_...` from Whop Developer → Webhooks). Missing/forged signature → **401**. Deduped per membership in D1.
- On a webhook sale the Worker DMs the buyer (if checkout metadata has `telegram_id`) and always sends the owner (chat `320423744`) a sale notice with plan, membership and key.

## 1) Find the purchase

Any of:

1. Whop seller dashboard → memberships / payments (Pioneer `plan_n2uiwphhI5YG7`, Starter `plan_IkWmnOwW1ShYY`, Pro `plan_SrqGnbkktuOUc`).
2. Receipt email to `N3mak.team@proton.me`.
3. Whop connector (once authenticated).

Capture: `membership_id`, buyer email, plan id, and Telegram id if present in checkout metadata.

## 2) Mint + deliver (one command)

```bash
cd /workspace/N3mak_Bot
bash scripts/manual-fulfill.sh <telegram_id|-> <pioneer|starter|pro> <membership_id> [email]
```

Calls `POST https://n3mak-gateway.n3mak.workers.dev/admin/mint` with the admin token from `secrets/n3mak-gateway.admin-token`. The Worker mints the key, DMs the buyer via @N3mak_bot (if a telegram id is given), and sends the owner the key. Use `-` for no Telegram id; then deliver from the owner notice via Whop message / email. Same membership twice → 409 (no double keys).

If the buyer DM fails ("bot can't initiate conversation"): buyer must open https://t.me/N3mak_bot and press `/start`; then forward the key from the owner notice.

## 3) Verify (optional)

```bash
KEY='n3k_…'
curl -sS https://n3mak-gateway.n3mak.workers.dev/v1/models -H "Authorization: Bearer $KEY"     # 200
curl -sS https://n3mak-gateway.n3mak.workers.dev/v1/chat/completions -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' -d '{"model":"gpt-oss-20b","messages":[{"role":"user","content":"ping"}]}'  # 200
```

## 4) Revoke

```bash
curl -sS -X POST https://n3mak-gateway.n3mak.workers.dev/admin/revoke \
  -H "Authorization: Bearer $(cat secrets/n3mak-gateway.admin-token)" -H 'Content-Type: application/json' \
  -d '{"membership_id":"<membership_id>"}'     # or {"key_id":"key_…"}
```

## 5) Record

The Worker records every key (D1 `api_keys`, hashed) and webhook fulfillment (D1 `fulfillments`). Post a one-line note in the ops chat: fulfilled / pending Telegram / emailed.

## Plans quick map

| Arg | Label | Plan id | Checkout |
|-----|-------|---------|----------|
| pioneer | Pioneer $3 | plan_n2uiwphhI5YG7 | https://whop.com/checkout/plan_n2uiwphhI5YG7 |
| starter | Starter $9 | plan_IkWmnOwW1ShYY | https://whop.com/checkout/plan_IkWmnOwW1ShYY |
| pro | Pro $49 | plan_SrqGnbkktuOUc | https://whop.com/checkout/plan_SrqGnbkktuOUc |
