# Tier differentiation proposal (NOT IMPLEMENTED)

Status: **IMPLEMENTED** (2026-11-06) in `tierLimits.js`, `mint_omni_key.py`, `whopFulfill.js`, `manual-fulfill.sh`. Pioneer RPM verified with parallel chat → HTTP 429 after 5/min.

## Current state (code)

Pioneer ($3) / Starter ($9) / Pro ($49) all call the same `fulfillMembership` path and mint the same OmniRoute key shape (`model_access_mode=all`, scopes `self:usage`, no per-plan caps). Buyers of $9/$49 get nothing enforceable over $3 today.

## What OmniRoute can enforce per key

Confirmed in OmniRoute `api_keys` / `src/lib/db/apiKeys.ts` (fields exist and are applied at request time):

| Capability | Fields |
|------------|--------|
| Daily request cap | `max_requests_per_day` |
| Per-minute rate | `max_requests_per_minute`, `rate_limits`, `throttle_delay_ms` |
| Model allow/deny | `model_access_mode`, `allowed_models`, `blocked_models` |
| Spend caps | `usage_limit_enabled`, `daily_usage_limit_usd`, `weekly_usage_limit_usd` |
| Sessions / IP / expiry | `max_sessions`, `ip_allowlist`, `expires_at` |
| Endpoints | `allowed_endpoints` |

Upstream provider quota-share is separate (pool-level), not a per-buyer sales tier. N3mak fulfillment (`mint_omni_key.py` / `/api/keys`) does **not** set any of the per-key limit fields yet.

## Proposed tiers (draft numbers — tune after first paid users)

| | Pioneer $3 | Starter $9 | Pro $49 |
|--|------------|------------|---------|
| `max_requests_per_day` | 200 | 1,000 | 10,000 |
| `max_requests_per_minute` | 5 | 20 | 60 |
| Models | Free/default only (`cfp/openai/gpt-oss-20b` + other free-tier aliases) | Free + mid-tier catalog | Broad catalog (`model_access_mode=all` or large allow-list) |
| `daily_usage_limit_usd` | optional soft $0.50 | $3 | $20 (or off) |
| Support | Bot self-serve + FAQ | Priority Telegram reply (owner queue) | Same-day owner reply |
| Key expiry | none / 30d trial option | none | none |

## Implementation sketch (when approved)

1. Map Whop `plan_id` → tier config in `whopFulfill.js`.
2. Pass limits into mint: extend `mint_omni_key.py` INSERT / OmniRoute `POST /api/keys` body with `maxRequestsPerDay`, `maxRequestsPerMinute`, `allowedModels` / `modelAccessMode`.
3. Echo limits in the Telegram fulfillment message and in `product-facts.md` once live.
4. Do **not** advertise differentiated limits until step 2 is live (avoids overselling $9/$49).

## Open questions for owner

- Exact model lists per tier (need a curated OmniRoute allow-list, not “whatever the gateway exposes”).
- Whether Pro should be uncapped RPD or just a high soft cap.
- Support SLAs: can owner realistically answer same-day for Pro?
