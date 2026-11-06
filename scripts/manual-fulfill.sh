#!/usr/bin/env bash
# Manual Whop → OmniRoute key → Telegram DM
# Usage: bash scripts/manual-fulfill.sh <telegram_id> <pioneer|starter|pro> [membership_id]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOT_ENV="$ROOT/bot/.env"
MINT="$ROOT/bot/src/fulfillment/mint_omni_key.py"
OMNI_BASE="${OMNIROUTE_ADMIN_BASE_URL:-http://127.0.0.1:20128}"
# Prefer public HTTPS base for buyer messages; never tell buyers 127.0.0.1 if a public URL exists.
if [[ -n "${OMNIROUTE_PUBLIC_BASE_URL:-}" && ! "$OMNIROUTE_PUBLIC_BASE_URL" =~ 127\.0\.0\.1|localhost ]]; then
  PUBLIC_V1="$OMNIROUTE_PUBLIC_BASE_URL"
else
  PUBLIC_V1="${OMNIROUTE_PUBLIC_BASE_URL:-${OPENAI_BASE_URL:-http://127.0.0.1:20128/v1}}"
fi

TG_ID="${1:-}"
PLAN_ARG="$(echo "${2:-pioneer}" | tr '[:upper:]' '[:lower:]')"
MEMBER_ID="${3:-manual-$(date -u +%Y%m%d-%H%M%S)}"

if [[ -z "$TG_ID" ]]; then
  echo "Usage: $0 <telegram_id> <pioneer|starter|pro> [membership_id]" >&2
  exit 2
fi

case "$PLAN_ARG" in
  pioneer) PLAN_ID="plan_n2uiwphhI5YG7"; PLAN_LABEL='Pioneer $3' ;;
  starter) PLAN_ID="plan_IkWmnOwW1ShYY"; PLAN_LABEL='Starter $9' ;;
  pro)     PLAN_ID="plan_SrqGnbkktuOUc"; PLAN_LABEL='Pro $49' ;;
  *) echo "Unknown plan: $PLAN_ARG" >&2; exit 2 ;;
esac

if [[ ! -f "$BOT_ENV" ]]; then
  echo "Missing $BOT_ENV" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$BOT_ENV"
set +a
if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "TELEGRAM_BOT_TOKEN missing in bot/.env" >&2
  exit 1
fi

IS_TEST=0
if [[ "$MEMBER_ID" == test-* ]] || [[ "$MEMBER_ID" == manual-test* ]]; then
  IS_TEST=1
fi

LABEL="whop-${PLAN_ARG}-${MEMBER_ID}"
if [[ "$IS_TEST" -eq 1 ]]; then
  LABEL="test-manual-$(date -u +%Y%m%d)-${PLAN_ARG}"
fi

MINT_JSON="$(python3 "$MINT" "$LABEL" "$PLAN_ID")"
KEY="$(printf '%s' "$MINT_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["key"])')"
KEY_ID="$(printf '%s' "$MINT_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
VIA="$(printf '%s' "$MINT_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("via","sqlite"))')"

MODELS_CODE="$(curl -sS -o /tmp/n3mak-models-check.json -w '%{http_code}' \
  -H "Authorization: Bearer ${KEY}" \
  "${OMNI_BASE}/v1/models" || true)"
CHAT_CODE="$(curl -sS -o /tmp/n3mak-chat-check.json -w '%{http_code}' \
  -H "Authorization: Bearer ${KEY}" -H 'Content-Type: application/json' \
  -d '{"model":"cfp/openai/gpt-oss-20b","messages":[{"role":"user","content":"ping"}],"max_tokens":16}' \
  "${OMNI_BASE}/v1/chat/completions" || true)"

if [[ "$MODELS_CODE" != "200" || "$CHAT_CODE" != "200" ]]; then
  echo "Verify failed: models=$MODELS_CODE chat=$CHAT_CODE" >&2
  unset TELEGRAM_BOT_TOKEN KEY
  exit 1
fi

export TG_ID MEMBER_ID PLAN_ID PLAN_LABEL KEY KEY_ID VIA PUBLIC_V1 MODELS_CODE CHAT_CODE IS_TEST

PAYLOAD_FILE="$(mktemp)"
python3 - <<'PY' > "$PAYLOAD_FILE"
import json, os
prefix = ""
if os.environ["IS_TEST"] == "1":
    prefix = "🧪 TEST ONLY — ignore / do not use in production.\n\n"
text = (
    f"{prefix}✅ تم تفعيل N3mak AI Gateway ({os.environ['PLAN_LABEL']})\n\n"
    f"BASE_URL: {os.environ['PUBLIC_V1']}\n"
    f"API_KEY: {os.environ['KEY']}\n"
    f"MODEL: cfp/openai/gpt-oss-20b\n\n"
    f"Membership: {os.environ['MEMBER_ID']}\n"
    f"Plan: {os.environ['PLAN_ID']}\n\n"
    "استخدمها كـ OpenAI-compatible client. Bot: @N3mak_bot\n"
    "للترقية: /buy على @N3mak_bot"
)
print(json.dumps({"chat_id": int(os.environ["TG_ID"]), "text": text}))
PY

SEND_JSON="$(curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H 'Content-Type: application/json' \
  --data-binary @"$PAYLOAD_FILE")"
rm -f "$PAYLOAD_FILE"

OK="$(printf '%s' "$SEND_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok"))')"
if [[ "$OK" != "True" ]]; then
  echo "Telegram send failed (buyer must /start first, or use Whop/email):" >&2
  printf '%s' "$SEND_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("description") or d)' >&2
  unset TELEGRAM_BOT_TOKEN KEY
  exit 1
fi

REC_DIR="/tmp/n3mak-fulfillments"
mkdir -p "$REC_DIR"
export REC="$REC_DIR/${MEMBER_ID}.json"
python3 - <<'PY'
import json, os, datetime
rec = {
  "membershipId": os.environ["MEMBER_ID"],
  "telegramId": int(os.environ["TG_ID"]),
  "planId": os.environ["PLAN_ID"],
  "planLabel": os.environ["PLAN_LABEL"],
  "keyId": os.environ["KEY_ID"],
  "keyPrefix": os.environ["KEY"][:12],
  "key": os.environ["KEY"],
  "mintVia": os.environ["VIA"],
  "baseUrl": os.environ["PUBLIC_V1"],
  "modelsHttp": int(os.environ["MODELS_CODE"]),
  "chatHttp": int(os.environ["CHAT_CODE"]),
  "test": os.environ["IS_TEST"] == "1",
  "at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
}
open(os.environ["REC"], "w").write(json.dumps(rec, indent=2) + "\n")
print("recorded", os.environ["REC"])
PY

echo "ok membership=$MEMBER_ID keyId=$KEY_ID via=$VIA models=$MODELS_CODE chat=$CHAT_CODE telegram=$TG_ID test=$IS_TEST"
unset TELEGRAM_BOT_TOKEN KEY OPENAI_API_KEY STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET
