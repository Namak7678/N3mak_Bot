# Free AI Intelligence & Agent Integration (FreeLLMArena)

Status: architecture decision / implementation guide. This document does not claim that a live provider integration or deployment has been completed.

## Decision

Use FreeLLMArena as N3mak's discovery, evaluation, and model-selection source — not as N3mak's inference API or a production dependency.

- Site: https://freellmarena.com
- Leaderboards: https://freellmarena.com/free-llm
- Task rankings: https://freellmarena.com/best-free-ai
- Always-on agent comparison: https://freellmarena.com/always-on-agents
- Free Arena: https://freellmarena.com/arena
- Embed widget: https://freellmarena.com/embed

The site ranks free/open-weight models using public Arena votes, checks free API availability through OpenRouter, reads model metadata from Hugging Face, and refreshes its catalogue nightly. It also publishes task-specific rankings and a free leaderboard widget.

Important limits:
- FreeLLMArena is not itself a general-purpose production API for N3mak.
- Its Free Arena currently has a daily duel quota; model-page try-outs also have daily limits.
- A model listed as free today may change limits, disappear, or become paid. Recheck provider terms and model licence before production use.
- The site's speed and local-memory figures are estimates, not guarantees.
- Never send customer secrets, payment data, personal data, API keys, or private business documents to public comparison tools.

## Fit with the existing N3mak_Bot repository

Keep the existing project and services. Do not create a second Telegram bot, gateway, database, or paid deployment.

Existing integration points verified in this repository:
- `bot/`: Node.js + Telegraf + Express Telegram bot.
- `gateway-worker/`: Cloudflare Worker with OpenAI-compatible `/v1/models` and `/v1/chat/completions`, D1 storage, and Workers AI.
- `bot/.env.example`: already defines an OpenAI-compatible endpoint and model, with the documented local OmniRoute default.
- `second-brain/`: existing knowledge workspace to hold model/agent intelligence.
- Existing Worker plans already define quotas and model access. Do not silently change prices, entitlements, or customer-facing plans as part of this discovery integration.

## Target architecture

Telegram user / N3mak web app
  -> existing N3mak Bot
  -> existing OpenAI-compatible gateway
  -> model router (OmniRoute-compatible provider interface)
  -> selected free provider API OR existing Cloudflare Workers AI OR local Ollama
  -> response + usage/provider metadata
  -> evaluation log and fallback decision

FreeLLMArena is a catalogue and evaluation input. It is not in the live request path.

## Model-selection policy

Maintain a small, replaceable registry. Select models by task, not by one global leaderboard position.

| N3mak role | Selection criteria | Safe initial routing |
|---|---|---|
| SARA / general assistant | chat quality, Arabic, instruction following | existing configured default; compare free candidates before switching |
| Researcher | search/reasoning quality, citations, long context | search-capable provider/tool plus a free reasoning model |
| Developer | code generation, debugging, structured output | coding-ranked model; require tests before accepting changes |
| Analyst | reasoning, tables, numeric consistency | reasoning model + deterministic calculation tools |
| Vision/document clerk | OCR, image/document understanding | vision/document-ranked model |
| Reviewer / auditor | independent critique, policy and factual checks | a different model/provider from the first drafter |
| Marketing | Arabic/English copy, variation quality | writing-ranked model; human approval before publishing |

Do not assume the highest overall chat score is best for every role. Run a small N3mak-specific evaluation set in Arabic and English before changing production routing.

## Free-first routing and fallback

1. Try an explicitly verified free API candidate for low-risk tasks.
2. If its free quota/rate limit is exhausted, fall back to the existing Cloudflare Workers AI model where the current plan permits.
3. If the cloud route is unavailable, use local Ollama only for tasks that fit the machine's available RAM/VRAM.
4. If all routes fail, return a clear temporary-unavailable message; do not silently call a paid model.
5. Log provider, model, task, latency, token/usage data when available, outcome, and fallback reason. Never log prompts containing secrets or private customer data.
6. Require approval for external side effects: sending messages, publishing posts, purchases, account changes, deployments, and financial actions.

## Agent workforce

Build roles inside the current N3mak Bot / SARA orchestration rather than separate Telegram bots:

- COO / Orchestrator: breaks work into tasks and assigns roles.
- Researcher: finds opportunities, markets, tenders, and sources.
- Analyst: validates evidence and numbers.
- Developer: proposes code changes and runs tests.
- Marketing: drafts campaigns and content.
- Customer Support: answers routine questions using approved knowledge.
- QA / Security Reviewer: checks outputs, permissions, and risk.
- Secretary: prepares daily summaries and task follow-ups.

The orchestrator should use 2–4 agents for ordinary work and increase concurrency only when the workload justifies it. Independent review is required for high-impact output.

## Agent runtime candidates

The site's comparison is a discovery shortlist, not a blanket endorsement:

- OpenClaw: mature general-purpose local/self-hosted agent runtime; supports Telegram and multiple channels. Existing N3mak/OpenClaw work should be inspected before any installation.
- Hermes Agent: scheduler, memory, and long-running jobs; user already has a local Hermes installation. Prefer reusing and stabilizing it over creating another runtime.
- ZeroClaw: lightweight option with approval gates; candidate for a later benchmark.
- nanobot: small Python multi-agent runtime with MCP support; candidate for a later benchmark.
- NanoClaw: multi-agent isolation, but its documented Claude dependency makes it unsuitable for a strict zero-cost baseline unless changed.
- AnyModelBot: interesting multi-persona desktop option, but early-stage; do not make it a production dependency yet.

No new runtime should be installed until the existing N3mak Bot, OmniRoute, OpenClaw, and Hermes components are inventoried and duplication is ruled out.

## FreeLLMArena widget option

The site's official widget can display a live top-five model list on a N3mak web page. It uses two lines of code, updates nightly, and is documented as free/no-cookie. Categories include chat, code, vision, image, video, documents, search, and agents.

Use this only as a public-facing "AI model intelligence" panel. It is optional and must not be required for bot operation.

## Rollout sequence

### Phase 1 — catalogue and baseline
- Save the current model/provider inventory and free-tier terms.
- Record candidates by task, licence, API availability, limits, context, and last verification date.
- Benchmark 10–20 representative N3mak prompts in Arabic and English.
- Keep the current production model unchanged until the comparison is complete.

### Phase 2 — routing adapter
- Add provider adapters behind the existing OpenAI-compatible gateway / OmniRoute path.
- Add per-task routing, timeouts, retries, quotas, and explicit paid-provider deny-by-default.
- Add provider health checks and deterministic fallback.
- Add unit/integration tests using mocked provider responses.

### Phase 3 — controlled agent team
- Add the roles above to the existing SARA/N3mak orchestration.
- Give each role least-privilege tools and separate task memory.
- Add approval gates and an audit log for external actions.
- Start with read-only research and draft-only marketing.

### Phase 4 — production verification
- Test Telegram commands, web/API requests, quota exhaustion, provider outages, Arabic responses, and fallback.
- Verify no paid provider is called when free-only mode is enabled.
- Deploy only after tests pass and existing paid-plan behavior remains intact.

## Configuration proposal (not yet implemented)

Use environment variables, never hard-code keys:

- `AI_ROUTING_MODE=free_first`
- `AI_ALLOW_PAID=false`
- `AI_PRIMARY_PROVIDER=`
- `AI_PRIMARY_MODEL=`
- `AI_FALLBACK_PROVIDER=cloudflare`
- `AI_FALLBACK_MODEL=gpt-oss-20b`
- `AI_LOCAL_BASE_URL=http://127.0.0.1:11434/v1`
- `AI_EVAL_LOGGING=true`

Only add variables after matching them to the actual gateway implementation. Do not add fake settings that the code does not read.

## Acceptance criteria

- Existing N3mak Telegram bot and gateway remain the only production entry points.
- No duplicate bot, database, or paid hosting resource is created.
- Free-only mode never silently falls back to a paid provider.
- Provider changes can be made from configuration/registry without rewriting bot commands.
- A model is promoted only after Arabic/English task benchmarks and regression tests.
- Risky external actions require explicit approval.
- Model source, licence, free-tier terms, and verification date are recorded.

## Source notes

- FreeLLMArena ranking methodology and data sources: https://freellmarena.com/about
- Main leaderboard and task filters: https://freellmarena.com/
- Free Arena model set and daily limit: https://freellmarena.com/arena
- Agent comparison and stated runtime capabilities: https://freellmarena.com/always-on-agents
- Widget installation: https://freellmarena.com/embed
- Privacy and data handling: https://freellmarena.com/privacy
