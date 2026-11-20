# N3mak Free AI — Verified Free Provider Plan

Status: provider research completed; external provider adapters are not yet enabled in production. This document is the acceptance gate for the next implementation phase.

## Non-negotiable free-only rules

- No paid model IDs, no prepaid credits, no automatic upgrade, no paid fallback.
- Treat provider quota exhaustion (429), billing-required responses, missing credentials, and unknown model IDs as provider unavailable; move only to another explicitly free route.
- Never send a request to an endpoint unless its selected model/provider is marked free in the registry.
- Keep provider keys in Cloudflare Worker secrets or the existing bot host's secret manager. Never commit keys or paste them into chat.
- Do not send customer secrets, payment data, personal data, or confidential business documents to free consumer API tiers.
- Do not treat free quotas as guaranteed uptime or unlimited capacity.
- Cloudflare Workers AI is excluded from strict free-only fallback unless the account has a hard zero-spend/billing guard verified by the owner. Its current binding may incur charges beyond included allowances.
- Existing customer plan entitlements and paid product routing must remain unchanged. Internal N3mak free mode must be a separate, explicit route.

## Provider shortlist (checked 2026-11-20)

| Priority | Provider | Verified free route | Best use | Limits / risk |
|---|---|---|---|---|
| 1 | Google Gemini API | Free tier explicitly lists free input/output for selected models; current pricing page lists Gemini 3.1 Flash-Lite Preview as free | General assistant, Arabic/English drafting, lightweight analysis | Preview models can change; free-tier prompts may be used to improve Google products; quotas vary by model/account. No paid fallback. |
| 2 | Groq | Free-plan limits are exposed in official console docs; currently listed models include openai/gpt-oss-120b, openai/gpt-oss-20b, and qwen/qwen3.8-27b | Fast chat, coding, short analysis | Exact Free Plan limits are account/model-specific; rate-limit headers and 429 must be handled. |
| 3 | OpenRouter | Free plan lists 25+ free models and 50 requests/day; free model variants are rate-limited | Extra overflow provider and model diversity | Free models are not production-guaranteed. The free route may change; only use model IDs explicitly marked free. |
| 4 | Cerebras | Official pricing page advertises a $0 Free tier and free API key | High-speed inference candidate | Public pricing/rate-limit documentation is older; verify current model availability and limits in account console before enabling. |
| 5 | Local Ollama (existing installation) | No per-token API charge; runs on the user's own machine | Offline/private fallback for small tasks | Limited by the existing Windows laptop's RAM/CPU; not a 24/7 cloud service. |

## Official references

- Gemini pricing and model-level free-tier status: https://ai.google.dev/gemini-api/docs/pricing
- Gemini API key setup: https://aistudio.google.com/app/apikey
- Groq rate limits and Free Plan limits: https://console.groq.com/docs/rate-limits
- Groq API keys: https://console.groq.com/keys
- OpenRouter free plan and quotas: https://openrouter.ai/pricing
- OpenRouter free model catalogue and free-variant limits: https://openrouter.ai/collections/free-models/
- OpenRouter API keys: https://openrouter.ai/settings/keys
- Cerebras pricing: https://inference-docs.cerebras.ai/support/pricing
- Cerebras API keys: https://cloud.cerebras.ai/

## Proposed internal-only routing order

1. Groq free plan for fast general/code tasks (after checking current account model limits).
2. Gemini free tier for general reasoning and Arabic/English drafting.
3. OpenRouter free-only model variants for overflow.
4. Existing local Ollama for small/private tasks when reachable.
5. Return a clear unavailable response.

The order is configurable and should be benchmarked on N3mak Arabic and English prompts. Do not send the same confidential prompt to multiple external providers.

## Implementation contract

- Add a dedicated internal free-only route; do not broaden Pioneer/Starter/Pro model entitlements.
- Add provider adapters using OpenAI-compatible requests where supported and Gemini's native API format where needed.
- Add a registry containing provider, model ID, free-tier status, task fit, and enabled flag.
- Add AI_ALLOW_PAID=false as a hard guard, not merely a preference. Paid model IDs and unverified providers must be rejected before network calls.
- Add provider-level timeouts, one retry at most, bounded cross-provider fallback, 429 handling, and response normalization.
- Expose only safe health metadata (enabled provider names and last health status); never expose keys.
- Add mocked tests for free-only rejection, quota fallback, missing key, timeout, malformed response, and all-providers-down.
- Require explicit operator approval before adding secrets or changing live bot routing.
- Do not deploy until the provider keys exist, the provider free tiers are confirmed in the actual accounts, and end-to-end tests pass.

## Current implementation boundary

The existing PR #20 implements task-aware selection and a two-attempt fallback over the existing Cloudflare Workers AI model list. It does not yet call Gemini, Groq, OpenRouter, or Cerebras. This is intentionally not described as an unlimited-free system.