# N3mak Free AI — Verified Free Provider Plan

Status: provider research completed. External provider adapters are not yet enabled. This document separates documented free routes from providers whose account-level free access still needs verification.

## Non-negotiable free-only rules

- No paid model IDs, prepaid credits, automatic upgrades, or paid fallbacks.
- Quota exhaustion (429), billing-required responses, missing credentials, and unknown model IDs mean that provider is unavailable.
- Never call an endpoint unless its exact model route is explicitly classified as free.
- Keep provider keys in the existing host's secret manager. Never commit keys or paste them into chat.
- Do not send customer secrets, payment data, personal data, or confidential business documents to free consumer API tiers.
- Free quotas are limited and can change; they are not guaranteed uptime or unlimited capacity.
- Exclude Cloudflare Workers AI from strict free-only routing unless a hard zero-spend billing guard is verified for the account. The existing binding may incur charges beyond included allowances.
- Do not alter customer plan entitlements or paid product routing. Internal N3mak Free AI must be a separate, explicitly enabled route.

## Provider assessment (checked 2026-11-20)

| Priority | Provider | What official documentation confirms | Decision |
|---|---|---|---|
| 1 | OpenRouter Free | Model IDs ending in `:free` are $0 model price; `openrouter/free` automatically selects an eligible free model. Free variants have 20 RPM and 50 RPD limits without a qualifying credit purchase. | First cloud adapter candidate. Hard-code `openrouter/free` only; never allow arbitrary model IDs or paid routing. |
| 2 | Google Gemini API | The pricing page lists Gemini 3.1 Flash-Lite as free input/output on the Free tier. Free-tier data may be used to improve Google products; quotas vary. | Second cloud adapter candidate. Enable only with a Google AI Studio project that has no billing account attached, so exhaustion cannot switch to paid billing. Confirm the selected model remains Free tier before enabling. |
| 3 | Cerebras | Official pricing page describes a $0 Free tier with lower rate limits and free API key; the page also lists paid Exploration pricing. | Hold. Do not enable until account dashboard and exact model availability confirm free inference. |
| 4 | Groq | Official model catalogue lists per-token prices for several production models. A developer/free plan limit is not proof that every listed model is free. | Hold. Do not enable until Groq account explicitly confirms a no-charge model/allowance and hard quota behavior. |
| 5 | Local Ollama (already installed) | No per-token API charge; runs on the user's own machine. | Local fallback for small tasks only; limited by available RAM/CPU and cannot provide cloud uptime. |

## Official references

- OpenRouter free models and free request limits: https://openrouter.ai/collections/free-models/
- OpenRouter pricing: https://openrouter.ai/pricing
- OpenRouter API keys: https://openrouter.ai/settings/keys
- Gemini pricing and model-level free-tier status: https://ai.google.dev/gemini-api/docs/pricing
- Gemini API key setup: https://aistudio.google.com/app/apikey
- Cerebras pricing: https://inference-docs.cerebras.ai/support/pricing
- Groq model catalogue and per-token pricing: https://console.groq.com/docs/models
- Groq rate limits: https://console.groq.com/docs/rate-limits

## Proposed internal-only routing order

1. OpenRouter `openrouter/free` (free model router only).
2. Gemini `gemini-3.1-flash-lite` on a project with billing disabled.
3. Existing local Ollama for small tasks when reachable.
4. Return a clear unavailable response.

Cerebras and Groq remain disabled until account-level free eligibility is verified. Benchmark Arabic and English N3mak prompts before promoting any model. Do not fan out confidential prompts to multiple external providers.

## Implementation contract

- Add a dedicated internal free-only route; do not broaden Pioneer/Starter/Pro entitlements.
- Hard-code the allowed free route IDs; do not accept caller-supplied arbitrary provider/model URLs.
- Add provider adapters, per-provider timeouts, one retry at most, bounded cross-provider fallback, 429 handling, and response normalization.
- Paid model IDs and unverified providers must be rejected before network calls.
- Expose only safe health metadata (provider names and status); never expose keys.
- Add mocked tests for free-only rejection, quota fallback, missing key, timeout, malformed response, and all-providers-down.
- Require operator approval before adding secrets or changing live bot routing.
- Do not deploy until the provider keys exist, free-tier eligibility is confirmed in the actual accounts, and end-to-end tests pass.

## Current implementation boundary

PR #20 currently implements task-aware selection and a two-attempt fallback over the existing Cloudflare Workers AI model list. It does not yet call Gemini, OpenRouter, Groq, or Cerebras. It is not an unlimited-free system and is not deployed.