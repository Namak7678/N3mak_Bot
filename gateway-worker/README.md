# n3mak-gateway (Cloudflare Worker)

Public OpenAI-compatible gateway for N3mak buyers. No dependency on the box.

- Base URL: `https://n3mak-gateway.n3mak.workers.dev/v1`
- `GET /v1/models`, `POST /v1/chat/completions` (Bearer `n3k_…` key; `stream:true` returns SSE)
- `POST /v1/demo/chat` — anonymous site demo (see Demo below)
- `POST /webhooks/whop` — Standard Webhooks HMAC-SHA256 (`WHOP_WEBHOOK_SECRET`); 401 if unsigned/forged or secret unset. Fulfills Pioneer/Starter/Pro, deduped per membership.
- `POST /admin/mint` `{plan, membership_id?, telegram_id?, email?, test?, notify?}` — plans: `pioneer|starter|pro|trial`
- `POST /admin/revoke` `{key|key_id|membership_id}` or `{telegram_id, plan:"trial"}`
- `GET /admin/trials/nudge-pending` / `POST /admin/trials/nudge-mark` — for bot expiry nudges
- Storage: D1 `n3mak-gateway`. Models: Workers AI.

| Plan | RPD | RPM | Models | Notes |
|------|-----|-----|--------|-------|
| Trial (free) | 20 | 5 | gpt-oss-20b | 24h expiry; one per Telegram user; global cap `TRIAL_GLOBAL_RPD` (default 1500/UTC day) |
| Pioneer $3 | 200 | 5 | gpt-oss-20b, llama-3.1-8b | |
| Starter $9 | 1000 | 20 | + gpt-oss-120b, mistral-small-3.1-24b, qwen2.5-coder-32b | |
| Pro $49 | 10000 | 60 | + llama-3.3-70b | |

## Demo — `POST /v1/demo/chat`

Anonymous, non-streaming. For storefronts.

**Request:** `{ "prompt": string }` (required, max 500 chars)

**Response 200:** `{ "reply": string, "model": "gpt-oss-20b", "remaining": number }`
- `remaining` = leftover per-IP daily quota after this call (0–2 after a successful call; daily max 3)

**Limits:**
- Per IP (`CF-Connecting-IP`): 3/UTC day, 1/minute
- Global: `DEMO_GLOBAL_RPD` (default 300) per UTC day
- Model: gpt-oss-20b only, max_tokens 256, short system prompt

**Errors:**
- `400` `{error}` — missing/too-long prompt or bad JSON
- `403` `{error, upgrade_url}` — Origin not allowed
- `405` `{error}` — wrong method
- `429` `{error, upgrade_url}` — IP or global cap (`upgrade_url` = Pioneer checkout)

**CORS:** `OPTIONS` preflight. Allowed origins:
- `https://n3mak-buy.vercel.app`
- `https://n3mak-web.vercel.app`
- `https://n3mak.vercel.app`
- any `https://*.netlify.app` (including deploy previews `https://*--*.netlify.app`)
- no `Origin` header (curl) allowed

**Example:**
```bash
curl -sS https://n3mak-gateway.n3mak.workers.dev/v1/demo/chat \
  -H 'content-type: application/json' \
  -d '{"prompt":"What is N3mak in one sentence?"}'
```

Deploy: upload Worker with AI + D1 bindings via Cloudflare API / wrangler. Schema: `schema.sql` (+ ALTER for existing DBs: `expires_at`, `nudged_at`, `limit_hit_at`, `key_plain`).
