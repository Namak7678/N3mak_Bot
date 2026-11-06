# n3mak-gateway (Cloudflare Worker)

Public OpenAI-compatible gateway for N3mak buyers. No dependency on the box.

- Base URL: `https://n3mak-gateway.n3mak.workers.dev/v1`
- `GET /v1/models`, `POST /v1/chat/completions` (Bearer `n3k_…` key; `stream:true` returns SSE)
- `POST /webhooks/whop` — Standard Webhooks HMAC-SHA256 (`WHOP_WEBHOOK_SECRET`); 401 if unsigned/forged or secret unset. Fulfills `membership.activated` / `membership.went_valid` / `payment.succeeded` for Pioneer/Starter/Pro, deduped per membership.
- `POST /admin/mint` `{plan, membership_id?, telegram_id?, email?, test?, notify?}` and `POST /admin/revoke` `{key|key_id|membership_id}` — Bearer `ADMIN_TOKEN` (box copy: `secrets/n3mak-gateway.admin-token`, gitignored).
- Storage: D1 `n3mak-gateway` (keys stored as SHA-256 hashes, RPM/RPD counters, fulfillments). Models: Workers AI.

| Plan | RPD | RPM | Models |
|------|-----|-----|--------|
| Pioneer $3 | 200 | 5 | gpt-oss-20b, llama-3.1-8b |
| Starter $9 | 1000 | 20 | + gpt-oss-120b, mistral-small-3.1-24b, qwen2.5-coder-32b |
| Pro $49 | 10000 | 60 | + llama-3.3-70b |

Model ids accept aliases: `gpt-oss-20b`, `cfp/openai/gpt-oss-20b`, `@cf/openai/gpt-oss-20b`.

Deploy: `wrangler deploy` (or Cloudflare API script upload with `ai` + `d1` bindings). Schema: `schema.sql`.
