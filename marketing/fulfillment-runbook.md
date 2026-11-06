# Manual Whop fulfillment runbook

Use this until Render hosts the bot and Whop can hit `POST /webhooks/whop`.
Never paste API keys into group chats. Prefer DM via `@N3mak_bot`.

## 0) Preconditions

- Box services up: bot `:3010`, OmniRoute `:20128`, Redis, Postgres.
- Buyer must have pressed `/start` on `@N3mak_bot` before a Telegram DM works.
- Owner chat id (ops): `320423744`. Official email: `N3mak.team@proton.me`.

## 1) Find the purchase

Any of:

1. Whop seller dashboard → memberships / payments (Pioneer `plan_n2uiwphhI5YG7`, Starter `plan_IkWmnOwW1ShYY`, Pro `plan_SrqGnbkktuOUc`).
2. Receipt email to `N3mak.team@proton.me`.
3. Whop connector (once authenticated).

Capture: `membership_id`, buyer email, plan id, and Telegram id if present in checkout metadata.

## 2) Mint an OmniRoute key

From repo root (label the key with membership + plan):

```bash
cd /workspace/N3mak_Bot
LABEL="whop-pioneer-<membershipId>"   # or starter / pro
python3 bot/src/fulfillment/mint_omni_key.py "$LABEL"
```

Or one-shot helper (mints + verifies + DMs):

```bash
bash scripts/manual-fulfill.sh <telegram_id> <pioneer|starter|pro> [membership_id]
```

Output is JSON with `key` and `id`. Do not log the full key to shared channels.

HTTP mint (`POST /api/keys` via `whopFulfill.js`) is preferred when `OMNIROUTE_MANAGE_API_KEY` works; otherwise the Python SQLite path is the fallback (same as production fulfill).

## 3) Verify the key

```bash
KEY='sk-…'   # from mint output
curl -sS -o /tmp/models.json -w '%{http_code}\n' \
  -H "Authorization: Bearer $KEY" \
  http://127.0.0.1:20128/v1/models
# expect 200

curl -sS -o /tmp/chat.json -w '%{http_code}\n' \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"cfp/openai/gpt-oss-20b","messages":[{"role":"user","content":"ping"}],"max_tokens":16}' \
  http://127.0.0.1:20128/v1/chat/completions
# expect 200 and a choices[0].message
```

Public BASE_URL for buyers (when hosted): value of `OMNIROUTE_PUBLIC_BASE_URL` / store copy. Local verify uses `http://127.0.0.1:20128/v1`.

## 4) Deliver

**Preferred — helper (marks TEST when membership starts with `test-`):**

```bash
bash scripts/manual-fulfill.sh <telegram_id> pioneer <membership_id>
```

**Manual Telegram send** (token from `bot/.env`, never echo it):

```bash
set -a; source bot/.env; set +a
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d chat_id=<telegram_id> \
  --data-urlencode text="$(cat <<MSG
✅ تم تفعيل N3mak AI Gateway (Pioneer \$3)

BASE_URL: <public or local /v1>
API_KEY: <key>
MODEL: cfp/openai/gpt-oss-20b

Membership: <membership_id>
Bot: @N3mak_bot — للترقية: /buy
MSG
)"
unset TELEGRAM_BOT_TOKEN
```

If send fails with “bot can't initiate conversation” / 403: buyer must open https://t.me/N3mak_bot and press `/start`, then retry. Until then deliver via Whop message or email to the receipt address (`N3mak.team@proton.me` CC ops).

## 5) Record

Write `/tmp/n3mak-fulfillments/<membershipId>.json` with membershipId, email, telegramId, planId, keyId, mintVia, baseUrl, `at` ISO timestamp (helper does this). Keep a one-line note in ops chat: fulfilled / pending Telegram / emailed.

## 6) Revoke a test key

Preferred (works on this box): `DELETE /api/keys/{id}` with the manage token from `~/.omniroute/.env` (`OMNIROUTE_API_KEY`). The copy in `/workspace/omniroute/.env` may 403.

```bash
# load manage token from ~/.omniroute/.env without printing it
set -a; source "$HOME/.omniroute/.env"; set +a
curl -sS -o /tmp/revoke.json -w '%{http_code}\n' -X DELETE \
  -H "Authorization: Bearer $OMNIROUTE_API_KEY" \
  http://127.0.0.1:20128/api/keys/<key-uuid>
# expect 200; then /v1/models with that key returns 401
unset OMNIROUTE_API_KEY
```

Fallback if DELETE is unavailable: delete the row from OmniRoute SQLite (`~/.omniroute/storage.sqlite` table `api_keys`). Setting `is_active=0` alone may not take effect until cache refresh.

## Plans quick map

| Arg | Label | Plan id | Checkout |
|-----|-------|---------|----------|
| pioneer | Pioneer $3 | plan_n2uiwphhI5YG7 | https://whop.com/checkout/plan_n2uiwphhI5YG7 |
| starter | Starter $9 | plan_IkWmnOwW1ShYY | https://whop.com/checkout/plan_IkWmnOwW1ShYY |
| pro | Pro $49 | plan_SrqGnbkktuOUc | https://whop.com/checkout/plan_SrqGnbkktuOUc |
