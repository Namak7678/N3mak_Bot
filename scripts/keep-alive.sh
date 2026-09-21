#!/usr/bin/env bash
set -euo pipefail
# Keep N3mak bot + OmniRoute responsive. Intended for cron / routine.
OMNI_URL=${OMNI_URL:-http://127.0.0.1:20128/v1/models}
BOT_URL=${BOT_URL:-http://127.0.0.1:3010/health}
ROOT=/workspace
log(){ echo "[$(date -Is)] $*"; }

# OmniRoute
if ! curl -fsS -m 8 "$OMNI_URL" -H "Authorization: Bearer ${OPENAI_API_KEY:-n3mak-local}" >/dev/null 2>&1; then
  KEY=$(rg -N '^OPENAI_API_KEY=' "$ROOT/N3mak_Bot/bot/.env" | cut -d= -f2- | tr -d '"' || true)
  if ! curl -fsS -m 8 "$OMNI_URL" -H "Authorization: Bearer ${KEY}" >/dev/null 2>&1; then
    log "OmniRoute DOWN — attempting restart"
    pkill -f 'omniroute|next start' 2>/dev/null || true
    cd "$ROOT/omniroute" && nohup npm run start >/tmp/omniroute-fix.log 2>&1 &
    sleep 8
  else
    log "OmniRoute OK (bot key)"
  fi
else
  log "OmniRoute OK"
fi

# Bot
if ! curl -fsS -m 5 "$BOT_URL" >/dev/null 2>&1; then
  log "Bot DOWN — restarting"
  fuser -k 3010/tcp 2>/dev/null || true
  cd "$ROOT/N3mak_Bot/bot" && nohup node src/index.js >/tmp/n3mak-bot.log 2>&1 & echo $! >/tmp/n3mak-bot.pid
  sleep 3
else
  log "Bot OK"
fi

curl -fsS -m 5 "$BOT_URL" | head -c 200; echo
