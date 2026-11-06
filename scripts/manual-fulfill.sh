#!/usr/bin/env bash
# Manual Whop fulfillment via the public n3mak-gateway Worker (Cloudflare).
# Mints a key for the plan, DMs the buyer on Telegram via @N3mak_bot (if telegram_id given),
# and sends the owner (320423744) a sale notice with the key for manual delivery.
#
# Usage: bash scripts/manual-fulfill.sh <telegram_id|-> <pioneer|starter|pro> [membership_id] [email]
#   telegram_id "-" = no Telegram DM to buyer (owner still gets the key).
#   membership_id starting with "test-" marks the message as TEST.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATEWAY="${N3MAK_GATEWAY_URL:-https://n3mak-gateway.n3mak.workers.dev}"
TOKEN_FILE="${N3MAK_GATEWAY_ADMIN_TOKEN_FILE:-$ROOT/secrets/n3mak-gateway.admin-token}"

TG_ID="${1:-}"
PLAN_ARG="$(echo "${2:-pioneer}" | tr '[:upper:]' '[:lower:]')"
MEMBER_ID="${3:-manual-$(date -u +%Y%m%d-%H%M%S)}"
EMAIL="${4:-}"

if [[ -z "$TG_ID" ]]; then
  echo "Usage: $0 <telegram_id|-> <pioneer|starter|pro> [membership_id] [email]" >&2
  exit 2
fi
case "$PLAN_ARG" in pioneer|starter|pro) ;; *) echo "Unknown plan: $PLAN_ARG" >&2; exit 2 ;; esac
[[ -f "$TOKEN_FILE" ]] || { echo "Missing admin token file $TOKEN_FILE" >&2; exit 1; }

export TG_ID PLAN_ARG MEMBER_ID EMAIL
BODY="$(python3 -c 'import json,os
tg=os.environ["TG_ID"]
print(json.dumps({"plan":os.environ["PLAN_ARG"],"membership_id":os.environ["MEMBER_ID"],
 "telegram_id": (int(tg) if tg not in ("-","") else None),"email":os.environ["EMAIL"] or None,
 "test": os.environ["MEMBER_ID"].startswith("test-")}))')"

RESP="$(curl -sS -X POST "$GATEWAY/admin/mint" \
  -H "Authorization: Bearer $(cat "$TOKEN_FILE")" -H 'Content-Type: application/json' \
  --data-binary "$BODY")"

# Print result without the full key (owner already has it in the private Telegram notice)
printf '%s' "$RESP" | python3 -c 'import json,sys
d=json.load(sys.stdin)
if not d.get("ok"): print("FAILED:", d); sys.exit(1)
print("ok membership=%s key_id=%s plan=%s buyer_dm=%s base_url=%s key_prefix=%s" % (
  sys.argv[1], d["id"], d["plan"], d.get("buyerSent"), d.get("base_url"), d["key"][:10]))' "$MEMBER_ID"
