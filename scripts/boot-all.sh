#!/usr/bin/env bash
# Idempotent boot for Redis + Postgres + N3mak bot + OmniRoute after box reboot.
set -euo pipefail

ROOT=/workspace
TOOLS="$ROOT/.tools"
NODE22="$TOOLS/node22"
PG_HOME="$TOOLS/postgres"
PG_DATA="$TOOLS/data/postgres"
REDIS_DATA="$TOOLS/data/redis"
PG_SOCK=/tmp/pg-run
LOG_PREFIX="[boot-all $(date -Is)]"
OMNI_PORT=20128
BOT_PORT=3010
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$TOOLS/ms-playwright}"
export PATH="$NODE22/bin:$PG_HOME/bin:$TOOLS/redis/bin:/usr/bin:/bin:$PATH"
if [[ -d "$TOOLS/redis/lib" ]]; then
  export LD_LIBRARY_PATH="$TOOLS/redis/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

log(){ echo "$LOG_PREFIX $*"; }

mkdir -p "$REDIS_DATA" "$PG_DATA" "$PG_SOCK" "$TOOLS"

# --- Self-heal system tools from /workspace cache (survives box wipe) ---
if [[ ! -x /usr/sbin/cron ]] && [[ -f "$TOOLS/debs/cron.deb" ]]; then
  log "reinstalling cron from cached debs"
  sudo dpkg -i "$TOOLS/debs/cron-daemon-common.deb" "$TOOLS/debs/cron.deb" >/dev/null 2>&1 || \
    sudo dpkg -i "$TOOLS/debs/cron.deb" >/dev/null 2>&1 || true
fi
if [[ -x /usr/sbin/cron ]] && ! pgrep -x cron >/dev/null 2>&1; then
  sudo /usr/sbin/cron >/dev/null 2>&1 || /usr/sbin/cron >/dev/null 2>&1 || true
fi
# Ensure crontab entries exist
if command -v crontab >/dev/null 2>&1; then
  if ! crontab -l 2>/dev/null | grep -q 'N3mak_Bot/scripts/keep-alive.sh'; then
    log "registering crontab"
    (crontab -l 2>/dev/null | grep -v 'N3mak_Bot/scripts' || true
     echo 'SHELL=/bin/bash'
     echo "PATH=$NODE22/bin:$PG_HOME/bin:$TOOLS/redis/bin:/usr/bin:/bin"
     echo '@reboot /workspace/N3mak_Bot/scripts/boot-all.sh >>/tmp/n3mak-boot.log 2>&1'
     echo '*/5 * * * * /workspace/N3mak_Bot/scripts/keep-alive.sh >>/tmp/n3mak-keep-alive.log 2>&1'
    ) | crontab - || true
  fi
fi
if [[ -d /etc/cron.d ]] && [[ ! -f /etc/cron.d/n3mak-boot ]]; then
  sudo tee /etc/cron.d/n3mak-boot >/dev/null <<CRON || true
SHELL=/bin/bash
PATH=$NODE22/bin:$PG_HOME/bin:$TOOLS/redis/bin:/usr/bin:/bin
@reboot box /workspace/N3mak_Bot/scripts/boot-all.sh >>/tmp/n3mak-boot.log 2>&1
*/5 * * * * box /workspace/N3mak_Bot/scripts/keep-alive.sh >>/tmp/n3mak-keep-alive.log 2>&1
CRON
  sudo chmod 644 /etc/cron.d/n3mak-boot 2>/dev/null || true
fi

# --- Redis ---
if ! redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
  log "starting redis"
  REDIS_BIN=$(command -v redis-server || true)
  if [[ -z "$REDIS_BIN" && -x "$TOOLS/redis/bin/redis-server" ]]; then REDIS_BIN="$TOOLS/redis/bin/redis-server"; fi
  if [[ -n "$REDIS_BIN" ]]; then
    "$REDIS_BIN" --daemonize yes --port 6379 --bind 127.0.0.1 \
      --dir "$REDIS_DATA" --dbfilename dump.rdb \
      --logfile /tmp/redis.log --pidfile /tmp/redis.pid || true
  else
    log "WARN redis-server missing"
  fi
  sleep 0.5
fi
redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1 && log "redis OK" || log "WARN redis down"

# --- Postgres (portable under /workspace/.tools) ---
if [[ ! -x "$PG_HOME/bin/pg_ctl" ]]; then
  # resolve symlink / extracted dir
  if [[ -d "$TOOLS/postgresql-18.6.1-x86_64-unknown-linux-gnu" ]]; then
    ln -sfn "$TOOLS/postgresql-18.6.1-x86_64-unknown-linux-gnu" "$PG_HOME"
  fi
fi
if [[ -x "$PG_HOME/bin/pg_ctl" ]]; then
  if ! "$PG_HOME/bin/pg_isready" -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    log "starting postgres"
    if [[ ! -f "$PG_DATA/PG_VERSION" ]]; then
      "$PG_HOME/bin/initdb" -D "$PG_DATA" -U postgres --auth=trust --encoding=UTF8 --locale=C
      cat >> "$PG_DATA/postgresql.conf" <<'PGEOF'
listen_addresses = '127.0.0.1'
port = 5432
unix_socket_directories = '/tmp/pg-run'
logging_collector = off
log_destination = 'stderr'
PGEOF
    fi
    mkdir -p "$PG_SOCK"
    "$PG_HOME/bin/pg_ctl" -D "$PG_DATA" -l /tmp/postgres.log -o "-k $PG_SOCK -p 5432" start || true
    sleep 2
  fi
  if "$PG_HOME/bin/pg_isready" -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    # ensure role+db
    "$PG_HOME/bin/psql" -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=0 <<'SQL' >/dev/null 2>&1 || true
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'n3mak') THEN
    CREATE ROLE n3mak LOGIN PASSWORD 'n3mak_local_dev';
  END IF;
END $$;
SQL
    "$PG_HOME/bin/psql" -h 127.0.0.1 -U postgres -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='n3mak'" 2>/dev/null | grep -q 1 \
      || "$PG_HOME/bin/psql" -h 127.0.0.1 -U postgres -d postgres -c "CREATE DATABASE n3mak OWNER n3mak;" >/dev/null 2>&1 || true
    "$PG_HOME/bin/psql" -h 127.0.0.1 -U postgres -d n3mak -c "GRANT ALL ON SCHEMA public TO n3mak;" >/dev/null 2>&1 || true
    log "postgres OK"
  else
    log "WARN postgres down"
  fi
else
  log "WARN portable postgres missing at $PG_HOME"
fi

# --- Bot ---
BOT_OK=0
if curl -fsS -m 5 "http://127.0.0.1:${BOT_PORT}/health" >/dev/null 2>&1 \
  || curl -fsS -m 5 "http://127.0.0.1:${BOT_PORT}/api/health" >/dev/null 2>&1; then
  BOT_OK=1
fi
if [[ "$BOT_OK" -ne 1 ]]; then
  log "starting bot"
  bash "$ROOT/N3mak_Bot/scripts/start-bot.sh" || true
  sleep 2
fi
if curl -fsS -m 5 "http://127.0.0.1:${BOT_PORT}/health" >/dev/null 2>&1 \
  || curl -fsS -m 5 "http://127.0.0.1:${BOT_PORT}/api/health" >/dev/null 2>&1; then
  log "bot OK"
else
  log "WARN bot down"
fi

# --- OmniRoute ---
OMNI_KEY=""
if [[ -f "$ROOT/N3mak_Bot/bot/.env" ]]; then
  OMNI_KEY=$(grep -E '^OPENAI_API_KEY=' "$ROOT/N3mak_Bot/bot/.env" | head -1 | cut -d= -f2- | tr -d '"' || true)
fi
OMNI_OK=0
if curl -fsS -m 8 "http://127.0.0.1:${OMNI_PORT}/v1/models" -H "Authorization: Bearer ${OMNI_KEY:-n3mak-local}" >/dev/null 2>&1; then
  OMNI_OK=1
fi
if [[ "$OMNI_OK" -ne 1 ]]; then
  log "starting OmniRoute"
  fuser -k "${OMNI_PORT}/tcp" 2>/dev/null || true
  pkill -f 'run-next.mjs' 2>/dev/null || true
  sleep 1
  if [[ ! -x "$NODE22/bin/node" ]]; then
    log "WARN node22 missing at $NODE22 — OmniRoute needs Node >=22.22.2"
  else
    cd "$ROOT/omniroute"
    # restore scripts/build if wiped
    if [[ ! -f scripts/build/postinstall.mjs ]] && [[ -d .git ]]; then
      git checkout HEAD -- scripts/build >/dev/null 2>&1 || true
    fi
    nohup env PATH="$NODE22/bin:$PATH" PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" \
      "$NODE22/bin/node" --max-old-space-size=4096 scripts/dev/run-next.mjs dev -p "$OMNI_PORT" \
      >/tmp/omniroute.log 2>&1 &
    echo $! >/tmp/omniroute.pid
    # wait up to ~90s for listen
    for _ in $(seq 1 30); do
      if curl -fsS -m 3 "http://127.0.0.1:${OMNI_PORT}/v1/models" -H "Authorization: Bearer ${OMNI_KEY:-n3mak-local}" >/dev/null 2>&1 \
        || curl -s -m 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${OMNI_PORT}/v1/models" | grep -Eq '401|200'; then
        break
      fi
      sleep 3
    done
  fi
fi
if curl -fsS -m 8 "http://127.0.0.1:${OMNI_PORT}/v1/models" -H "Authorization: Bearer ${OMNI_KEY:-n3mak-local}" >/dev/null 2>&1 \
  || curl -s -m 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${OMNI_PORT}/v1/models" | grep -Eq '401|200'; then
  log "OmniRoute OK"
else
  log "WARN OmniRoute down"
fi

log "done"

# --- Public gateway + Cloudflare Tunnel ---
# Path filter: /v1 -> OmniRoute, /webhooks/whop -> bot. Named tunnel n3mak-gateway is ready
# (secrets/n3mak-gateway.tunnel-token) but this box currently cannot reach Cloudflare edge
# (QUIC/HTTP2 port 7844 blocked → TLS EOF). Quick tunnel is attempted as stopgap; URL changes on restart.
GW_PORT=20130
if ! curl -fsS -m 2 "http://127.0.0.1:$GW_PORT/healthz" >/dev/null 2>&1; then
  log "starting public-gateway on :$GW_PORT"
  nohup node "$ROOT/N3mak_Bot/scripts/public-gateway.mjs" >>/tmp/n3mak-public-gateway.log 2>&1 &
  sleep 0.5
fi
CFBIN="$TOOLS/bin/cloudflared"
if [[ -x "$CFBIN" ]]; then
  if ! pgrep -f 'cloudflared tunnel' >/dev/null 2>&1; then
    log "starting cloudflared quick tunnel (stopgap; named tunnel token on disk)"
    nohup "$CFBIN" tunnel --url "http://127.0.0.1:$GW_PORT" --no-autoupdate --protocol http2 \
      >>/tmp/n3mak-cloudflared.log 2>&1 &
    sleep 3
    PUB=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/n3mak-cloudflared.log 2>/dev/null | tail -1 || true)
    if [[ -n "$PUB" ]]; then
      log "quick tunnel URL: $PUB (may be unreachable if edge port 7844 is blocked)"
      # Update bot env public URLs when tunnel appears healthy
      if curl -fsS -m 8 -o /dev/null -w '' "$PUB/healthz" 2>/dev/null; then
        ENVF="$ROOT/N3mak_Bot/bot/.env"
        if [[ -f "$ENVF" ]]; then
          sed -i "s|^OMNIROUTE_PUBLIC_BASE_URL=.*|OMNIROUTE_PUBLIC_BASE_URL=${PUB}/v1|" "$ENVF" || true
          sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=${PUB}|" "$ENVF" || true
          sed -i "s|^WHOP_WEBHOOK_URL=.*|WHOP_WEBHOOK_URL=${PUB}/webhooks/whop|" "$ENVF" || true
          grep -q '^OMNIROUTE_PUBLIC_BASE_URL=' "$ENVF" || echo "OMNIROUTE_PUBLIC_BASE_URL=${PUB}/v1" >>"$ENVF"
          grep -q '^PUBLIC_URL=' "$ENVF" || echo "PUBLIC_URL=${PUB}" >>"$ENVF"
          grep -q '^WHOP_WEBHOOK_URL=' "$ENVF" || echo "WHOP_WEBHOOK_URL=${PUB}/webhooks/whop" >>"$ENVF"
          log "wrote public URLs into bot/.env"
        fi
      else
        log "WARN quick tunnel issued but healthz not reachable — leaving public URLs unset"
      fi
    fi
  fi
else
  log "WARN cloudflared missing at $CFBIN"
fi

