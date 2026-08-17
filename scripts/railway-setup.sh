#!/usr/bin/env bash
# =============================================================================
# N3mak Bot — Railway setup script
# =============================================================================
# This script automates the entire Railway deployment using the Railway CLI.
# Run it on YOUR LOCAL MACHINE (not the sandbox) once you have:
#   - Node.js >= 18 installed
#   - Railway CLI installed (npm i -g @railway/cli)
#   - Logged in to Railway (railway login)
#
# What it does:
#   1. Creates a new Railway project (or uses existing one)
#   2. Adds a Postgres plugin
#   3. Adds a Redis plugin
#   4. Creates a service from this GitHub repo
#   5. Wires DATABASE_URL and REDIS_URL via Railway references
#   6. Sets TELEGRAM_BOT_TOKEN (read from local .env or interactive prompt)
#   7. Triggers a first deploy
#   8. Waits for the service URL, then sets PUBLIC_URL
#   9. Triggers a second deploy so the webhook registers
#   10. Verifies the bot is reachable via /api/health
#
# Usage:
#   RAILWAY_TOKEN=xxx-xxx-xxx ./scripts/railway-setup.sh
# Or, if already logged in via `railway login`:
#   ./scripts/railway-setup.sh
# =============================================================================

set -euo pipefail

# ---- Config -----------------------------------------------------------------
REPO_URL="https://github.com/Namak7678/N3mak_Bot"
BRANCH="arena/01a011d4-n3mak-bot"
PROJECT_NAME="n3mak-api"
SERVICE_NAME="api"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

say()    { echo -e "${BOLD}==>${NC} $*"; }
ok()     { echo -e "  ${GREEN}✓${NC} $*"; }
warn()   { echo -e "  ${YELLOW}!${NC} $*"; }
fail()   { echo -e "  ${RED}✗${NC} $*"; exit 1; }

# ---- Pre-flight checks ------------------------------------------------------
say "Pre-flight checks"

command -v railway >/dev/null 2>&1 || fail "Railway CLI not found. Install: npm i -g @railway/cli"
command -v node    >/dev/null 2>&1 || fail "Node.js not found. Install: https://nodejs.org"
command -v gh      >/dev/null 2>&1 || warn "gh CLI not found (optional, used for repo info)"

# Confirm CLI is authenticated
if ! railway whoami >/dev/null 2>&1; then
  fail "Not logged in to Railway. Run: railway login"
fi
ok "Railway CLI authenticated as $(railway whoami)"

# ---- Token ------------------------------------------------------------------
if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
  if [ -f .env ] && grep -q '^TELEGRAM_BOT_TOKEN=' .env; then
    TELEGRAM_BOT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")
    ok "Loaded TELEGRAM_BOT_TOKEN from .env"
  else
    echo -ne "${CYAN}Enter TELEGRAM_BOT_TOKEN:${NC} "
    read -rs TELEGRAM_BOT_TOKEN
    echo
  fi
fi
[ -z "$TELEGRAM_BOT_TOKEN" ] && fail "TELEGRAM_BOT_TOKEN is required"
ok "TELEGRAM_BOT_TOKEN captured (len=${#TELEGRAM_BOT_TOKEN})"

# ---- Project bootstrap ------------------------------------------------------
say "Setting up Railway project: $PROJECT_NAME"

# Init the project in the current directory (Railway will prompt if not linked)
railway init --name "$PROJECT_NAME" 2>/dev/null || railway link --name "$PROJECT_NAME" 2>/dev/null || true
ok "Project linked"

# ---- Add Postgres + Redis ---------------------------------------------------
say "Adding Postgres plugin"
if railway add --plugin postgresql 2>&1 | tee /tmp/n3mak-pg.log | grep -qE "Postgres|already exists"; then
  ok "Postgres added"
else
  warn "Postgres add may have failed — check /tmp/n3mak-pg.log"
fi

say "Adding Redis plugin"
if railway add --plugin redis 2>&1 | tee /tmp/n3mak-redis.log | grep -qE "Redis|already exists"; then
  ok "Redis added"
else
  warn "Redis add may have failed — check /tmp/n3mak-redis.log"
fi

# ---- Service from GitHub ----------------------------------------------------
say "Creating service from GitHub repo: $REPO_URL @ $BRANCH"
if railway up --repo "$REPO_URL" --branch "$BRANCH" --service "$SERVICE_NAME" 2>&1 | tee /tmp/n3mak-svc.log; then
  ok "Service created"
else
  warn "Service creation returned non-zero (may already exist) — see /tmp/n3mak-svc.log"
fi

# ---- Environment variables --------------------------------------------------
say "Setting environment variables"
railway variables --service "$SERVICE_NAME" --set "TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN"
railway variables --service "$SERVICE_NAME" --set "NODE_ENV=production"
railway variables --service "$SERVICE_NAME" --set "PORT=3000"
# Reference variables — Railway resolves these at runtime
railway variables --service "$SERVICE_NAME" --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}'
railway variables --service "$SERVICE_NAME" --set 'REDIS_URL=${{Redis.REDIS_URL}}'
ok "Variables set (TELEGRAM_BOT_TOKEN, NODE_ENV, PORT, DATABASE_URL, REDIS_URL)"

# ---- Trigger first deploy ---------------------------------------------------
say "Triggering first deploy"
railway up --service "$SERVICE_NAME" --detach
ok "Deploy started — this usually takes 1-2 minutes"

# ---- Wait for domain + set PUBLIC_URL ---------------------------------------
say "Waiting for service domain to be ready (max 120s)"
DOMAIN=""
for i in $(seq 1 24); do
  sleep 5
  DOMAIN=$(railway domain --service "$SERVICE_NAME" 2>/dev/null | tail -1 || true)
  if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "No domain" ]; then
    ok "Got domain: $DOMAIN"
    break
  fi
  printf "."
done
echo

if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "No domain" ]; then
  warn "Could not auto-detect domain. You may need to set PUBLIC_URL manually in Railway Dashboard."
else
  railway variables --service "$SERVICE_NAME" --set "PUBLIC_URL=https://$DOMAIN"
  ok "PUBLIC_URL set to https://$DOMAIN"
  say "Triggering second deploy to register the webhook"
  railway up --service "$SERVICE_NAME" --detach
fi

# ---- Final verification -----------------------------------------------------
say "Verifying health endpoint"
for i in 1 2 3 4 5 6; do
  sleep 10
  if [ -n "$DOMAIN" ]; then
    if curl -sf "https://$DOMAIN/api/health" >/dev/null 2>&1; then
      ok "Health check passed: https://$DOMAIN/api/health"
      break
    fi
  fi
  if [ $i -eq 6 ]; then
    warn "Health check did not respond in time. Check Railway logs: railway logs --service $SERVICE_NAME"
  fi
done

cat <<EOF

${GREEN}${BOLD}============================================================${NC}
${GREEN}${BOLD} ✅ N3mak bot deployment finished${NC}
${GREEN}${BOLD}============================================================${NC}

Next steps:
  1. Open Telegram, message @N3mak_bot, send /start
  2. Verify the welcome message appears
  3. Check logs anytime with:  railway logs --service $SERVICE_NAME

Useful commands:
  railway variables --service $SERVICE_NAME     # view env vars
  railway logs --service $SERVICE_NAME          # tail logs
  railway redeploy --service $SERVICE_NAME      # force redeploy
  railway open                                 # open dashboard
EOF
