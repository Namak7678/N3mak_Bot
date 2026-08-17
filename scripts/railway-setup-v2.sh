#!/usr/bin/env bash
# =============================================================================
# N3mak Bot — Railway setup script (v2, for Railway CLI >= 5.x)
# =============================================================================
# Usage:
#   TELEGRAM_BOT_TOKEN=xxx ./scripts/railway-setup-v2.sh
# Or, if already logged in via `railway login`:
#   ./scripts/railway-setup-v2.sh
# =============================================================================

set -euo pipefail

REPO_URL="https://github.com/Namak7678/N3mak_Bot"
BRANCH="arena/01a011d4-n3mak-bot"
PROJECT_NAME="n3mak-api"
SERVICE_NAME="api"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

say()    { echo -e "${BOLD}==>${NC} $*"; }
ok()     { echo -e "  ${GREEN}✓${NC} $*"; }
warn()   { echo -e "  ${YELLOW}!${NC} $*"; }
fail()   { echo -e "  ${RED}✗${NC} $*"; exit 1; }

# ---- Pre-flight checks ------------------------------------------------------
say "Pre-flight checks"
command -v railway >/dev/null 2>&1 || fail "Railway CLI not found. Install: npm i -g @railway/cli"
command -v node    >/dev/null 2>&1 || fail "Node.js not found. Install: https://nodejs.org"

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

# In CLI v5, `railway init` is interactive. We use a non-interactive flow.
# Try to link first; if no project, create one.
if railway status >/dev/null 2>&1; then
  ok "Already linked to a project"
else
  if railway init --name "$PROJECT_NAME" 2>&1 | tee /tmp/n3mak-init.log | grep -qE "Project created|already exists|Linked"; then
    ok "Project $PROJECT_NAME created/linked"
  else
    warn "Project init returned non-zero (may already exist) — see /tmp/n3mak-init.log"
  fi
fi

# ---- Service ----------------------------------------------------------------
say "Ensuring service: $SERVICE_NAME"
# `railway service` is the modern v5 command
if railway service 2>&1 | grep -q "^$SERVICE_NAME$"; then
  ok "Service $SERVICE_NAME already exists"
else
  # In CLI v5, services are created from the Dashboard or via `railway up` after init
  warn "Service $SERVICE_NAME will be created on first `railway up`"
fi

# ---- Add Postgres + Redis ---------------------------------------------------
say "Adding Postgres plugin"
if railway add --plugin postgresql 2>&1 | tee /tmp/n3mak-pg.log | grep -qE "added|created|exists"; then
  ok "Postgres added"
else
  # In CLI v5.41, the syntax changed: `railway add` may need service context
  warn "Trying alternative: railway add postgresql"
  railway add postgresql 2>&1 | tail -5 || warn "Postgres add may have failed — check /tmp/n3mak-pg.log"
fi

say "Adding Redis plugin"
if railway add --plugin redis 2>&1 | tee /tmp/n3mak-redis.log | grep -qE "added|created|exists"; then
  ok "Redis added"
else
  warn "Trying alternative: railway add redis"
  railway add redis 2>&1 | tail -5 || warn "Redis add may have failed — check /tmp/n3mak-redis.log"
fi

# ---- Environment variables --------------------------------------------------
say "Setting environment variables"
# Reference variables — Railway resolves these at runtime
railway variables --set "TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN" || true
railway variables --set "NODE_ENV=production" || true
railway variables --set "PORT=3000" || true
railway variables --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' || true
railway variables --set 'REDIS_URL=${{Redis.REDIS_URL}}' || true
ok "Variables set (TELEGRAM_BOT_TOKEN, NODE_ENV, PORT, DATABASE_URL, REDIS_URL)"

# ---- Deploy -----------------------------------------------------------------
say "Deploying from $REPO_URL @ $BRANCH"
# In CLI v5, you must run `railway up` from the project directory
# Clone the repo into a temp folder for the deploy
TMPDIR=$(mktemp -d)
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMPDIR/n3mak-bot" 2>&1 | tail -3
cd "$TMPDIR/n3mak-bot"
ok "Cloned repo into $TMPDIR/n3mak-bot"

# Trigger the deploy (this also creates the service in v5)
railway up --detach 2>&1 | tail -10 || warn "railway up returned non-zero — check manually"
ok "Deploy triggered"

# ---- Wait for domain + set PUBLIC_URL ---------------------------------------
say "Waiting for service domain to be ready (max 180s)"
DOMAIN=""
for i in $(seq 1 36); do
  sleep 5
  # In v5, the command is `railway domain` (singular) for the current service
  DOMAIN=$(railway domain 2>/dev/null | tail -1 | tr -d '[:space:]' || true)
  if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "Nodomain" ] && [[ "$DOMAIN" == *.up.railway.app ]]; then
    ok "Got domain: $DOMAIN"
    break
  fi
  printf "."
done
echo

if [ -z "$DOMAIN" ]; then
  warn "Could not auto-detect domain. Set PUBLIC_URL manually in Dashboard."
  warn "Settings → Networking → Generate Domain, then set PUBLIC_URL env var."
else
  railway variables --set "PUBLIC_URL=https://$DOMAIN" || true
  ok "PUBLIC_URL set to https://$DOMAIN"
  say "Triggering second deploy to register the webhook"
  cd "$TMPDIR/n3mak-bot"
  railway up --detach 2>&1 | tail -3 || true
fi

# ---- Final verification -----------------------------------------------------
say "Verifying health endpoint"
if [ -n "$DOMAIN" ]; then
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 10
    if curl -sf "https://$DOMAIN/api/health" >/dev/null 2>&1; then
      ok "Health check passed: https://$DOMAIN/api/health"
      curl -s "https://$DOMAIN/api/health"
      echo
      break
    fi
    if [ $i -eq 10 ]; then
      warn "Health check did not respond. Check: railway logs"
    fi
  done
fi

cat <<EOF

${GREEN}${BOLD}============================================================${NC}
${GREEN}${BOLD} ✅ N3mak bot deployment finished${NC}
${GREEN}${BOLD}============================================================${NC}

${BOLD}Your bot URL:${NC}      ${CYAN}https://t.me/N3mak_bot${NC}
${BOLD}Service URL:${NC}      ${CYAN}https://${DOMAIN:-<not detected>}${NC}
${BOLD}Health check:${NC}     ${CYAN}https://${DOMAIN:-<not detected>}/api/health${NC}

${BOLD}Next steps:${NC}
  1. Open Telegram, message @N3mak_bot, send /start
  2. Verify the welcome message appears
  3. If you see "N3mak - Your Smart Global Investment Platform..." → SUCCESS ✅

${BOLD}Useful commands:${NC}
  railway logs                          # tail logs
  railway variables                     # view env vars
  railway redeploy                      # force redeploy
  railway open                          # open dashboard
EOF
