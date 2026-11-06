# Public HTTPS tunnel status (2026-11-06)

## Done
- Cloudflare account connected as `n3mak.team@proton.me` (account `b125879eb08967997551dccf8a3ef774`).
- Named tunnel **n3mak-gateway** created: `28a1068e-4ad9-47e3-bbed-7192f967c26a`.
- Run token saved at `secrets/n3mak-gateway.tunnel-token` (mode 600, gitignored).
- `cloudflared` 2026.10.7 installed at `/workspace/.tools/bin/cloudflared`.
- Local path gateway `scripts/public-gateway.mjs` on `:20130`: only `/v1/*` → OmniRoute `:20128`, `/webhooks/whop` → bot `:3010`; other paths 404/own health. Unauthenticated `/v1/models` → **401**.
- `boot-all.sh` starts gateway + attempts quick tunnel.

## Blocker (not Auto-review)
This box cannot open a Cloudflare Tunnel edge connection:

- QUIC to port 7844 fails
- HTTP/2 to port 7844 fails (`TLS handshake with edge error: EOF`, edge IP `198.18.0.1` via sandbox egress)
- Precheck: `hard_fail=true` — “Allow outbound QUIC/TCP traffic on port 7844”
- Quick tunnel hostnames are issued but return **530** from the public internet

No Cloudflare **zone/DNS** on the account → even a healthy named tunnel cannot get a stable custom hostname until a domain is added.

## Required from owner
1. Add a domain to Cloudflare (zone) **or** run `cloudflared` on a host with open egress to CF edge (desktop currently offline).
2. Paste Whop webhook signing secret into `WHOP_WEBHOOK_SECRET` (`ws_...` from Whop Developer → Webhooks) and set webhook URL to `https://<public>/webhooks/whop`.
3. Set `OMNIROUTE_PUBLIC_BASE_URL=https://<public>/v1` (never `127.0.0.1` for buyers).
