# N3MAK Control Core — BITRA Adoption Plan

Status: workforce control core implemented on a non-production feature branch; database integration tests added, execution verification pending.
Source project: https://github.com/BijectiveLabs/bitra
Target repository: https://github.com/Namak7678/N3mak_Bot

## Decision

Adopt BITRA's governance patterns, not its trading application or Python runtime. N3MAK is a Node.js/Telegraf bot plus an OpenAI-compatible Cloudflare Worker gateway. Replacing that stack with BITRA would duplicate services and introduce an unrelated trading domain.

The BITRA repository declares MIT, Python >=3.11, and Alpha status. Its MCP surface is intentionally read-only. Keep the upstream copyright and license notices if any upstream source is copied; this proposal ports architectural ideas and does not copy Python implementation code.

## Verified existing N3MAK components

- `bot/`: Node.js + Telegraf + Express Telegram application.
- `gateway-worker/`: Cloudflare Worker exposing OpenAI-compatible model and chat endpoints, backed by existing D1 and Workers AI bindings.
- `gateway-worker/src/ai-router.mjs`: task-specific model preferences, tier allow-list filtering, and bounded two-attempt fallback.
- `gateway-worker/src/ai-router.test.mjs`: tests task ordering, plan restrictions, explicit model selection, invalid tasks, bounded fallback and empty responses.
- `gateway-worker/src/free-ai-router.mjs`: optional free-provider adapters with timeouts and a fail-closed result when no verified free provider is configured.
- `bot/src/commands.js`: existing Telegram commands and LLM entry points.
- `bot/package.json`: existing Node test runner and PostgreSQL/Redis dependencies.

The existing integration note says production deployment and live Cloudflare verification have not been completed. Do not treat source-code presence as production readiness.

## What to reuse from BITRA

1. **Closed task contracts:** every agent input and output has a strict schema; reject unknown fields and malformed responses.
2. **Evidence-bound answers:** require each factual claim to reference evidence IDs supplied in the task brief; validate references in code.
3. **Deterministic policy gates:** models propose; ordinary code checks permissions, budgets, data freshness, customer plan, and approval requirements.
4. **Independent review:** reviewer receives the proposal and its evidence, not the drafter's hidden reasoning; use a different model/provider when available.
5. **Append-only audit records:** record task lifecycle, agent/model, evidence references, hashes, decision, refusal reason, approval, latency and usage. Never store API keys or sensitive customer prompts in audit rows.
6. **Bounded execution:** fixed timeouts, limited retries, idempotency keys, concurrency limits, per-task token budgets and resumable task state.
7. **Read-only MCP first:** expose status, task reports, approved knowledge and audit summaries as read tools. Do not expose payment, publishing, account, deployment or destructive tools to agents in the first release.

## What not to reuse

- Crypto market feeds, exchange adapters, order execution, trading strategies, trading risk calculations, portfolio accounting and venue keys.
- BITRA's Python CLI as a replacement for the existing Telegram bot or gateway.
- Its local filesystem ledger as a reason to create a second database for N3MAK.
- Its model roster or model names as fixed production choices.

## Proposed N3MAK design

### Runtime boundary

Telegram / existing clients -> existing Bot -> Workforce Orchestrator -> existing AI Gateway / OmniRoute -> selected model.

The orchestrator owns task lifecycle and permissions. The gateway remains responsible for model routing, plan allow-lists, provider fallback and usage metadata. Do not move customer entitlement checks out of the gateway.

### Initial roles

- COO / Orchestrator: decomposes tasks and assigns bounded work.
- Researcher: gathers sources and returns evidence references.
- Analyst: checks facts, calculations and contradictions.
- Developer: proposes code changes and test plans; cannot merge or deploy.
- QA / Security Reviewer: checks evidence, policy and permission boundaries.
- Secretary: produces summaries and follow-ups.
- Marketing: drafts content only.
- Customer Support: answers from approved product knowledge.

Start with at most 2–4 agents per ordinary task. Use deterministic code for routing, arithmetic, access control, and approvals rather than spending model calls on those jobs.

### Task contract

Each task should carry:
- task_id and idempotency_key
- requesting user / tenant and customer plan
- task_type and priority
- data classification
- allowed agent roles and allowed tools
- evidence bundle references
- model/token/time budget
- approval policy
- status and expiry

Each agent response should carry:
- status: completed | needs_evidence | refused | failed
- concise result
- structured claims with evidence IDs
- proposed next action (never executed by the model)
- model/provider and usage metadata

### Policy gates

Default-deny external side effects. Human approval is required before sending messages, publishing content, purchases, refunds, payment changes, account changes, repository writes, deployments, or other irreversible actions.

A model must never grant itself permissions, expand a task's tool allow-list, raise its own budget, or disable approval requirements.

### Persistence

Use the repository's existing persistence services after confirming their current schemas and ownership. Do not create a new database or paid service. Add an append-only audit structure only after checking existing tables and migrations. Keep secrets in platform secret stores, never in task records.

### Suggested code boundaries (proposal, not yet created)

- `bot/src/agents/registry.js`: role definitions and capabilities.
- `bot/src/agents/task-schema.js`: strict task and result validation.
- `bot/src/agents/orchestrator.js`: decomposition, bounded parallel execution and resume.
- `bot/src/agents/policy-gate.js`: permission, budget and approval decisions.
- `bot/src/agents/evidence-check.js`: evidence reference validation.
- `bot/src/agents/audit-ledger.js`: append-only lifecycle records.
- `bot/src/agents/reviewer.js`: independent QA/security review.
- `bot/src/agents/agents.test.js`: permission, validation, retry, audit and resume tests.

These paths must be checked against the latest tree before implementation to avoid duplicating existing modules.

## Rollout

### Phase 0 — baseline (completed for source inspection)
- Confirm repository access and branch.
- Inspect existing router, fallback and tests.
- Inspect existing persistence and deployment configuration.
- No production configuration changes.

### Phase 1 — read-only workforce core
- Add strict task/result contracts and agent registry.
- Add deterministic policy and evidence gates.
- Add append-only audit records using existing persistence.
- Add a read-only task status/report interface.
- Test with mocked model responses; no external side effects.

### Phase 2 — controlled task execution
- Add 2–4 roles and independent review.
- Add bounded fallback, budget controls, idempotency and resume.
- Enforce free-only mode as deny-by-default for paid providers.
- Test Arabic and English task sets.

### Phase 3 — approved actions
- Add individual action adapters only where required.
- Require explicit approval and record the approver.
- Keep payment, refunds, publishing, repository writes and deployment disabled until each adapter passes its own security tests.

### Phase 4 — production verification
- Verify bot, gateway, quotas, model routing, provider outages, duplicate requests and restart recovery.
- Verify no paid model is called when free-only mode is active.
- Deploy only after CI passes and existing customer plans/entitlements remain unchanged.

## Acceptance criteria

- No second Telegram bot, gateway, database or paid deployment.
- Existing N3MAK model routing and plan allow-lists remain intact.
- All agent outputs validate against strict schemas.
- All factual claims cite evidence references or are explicitly marked unverified.
- No agent can invoke a tool outside its assigned allow-list.
- All side effects are denied without explicit human approval.
- Retries are bounded and idempotent; duplicate task delivery does not duplicate side effects.
- Audit records contain no secrets and are verifiable.
- Automated tests pass before any deployment.

## Current execution status

- A non-production branch was created: `feat/bitra-control-core-adoption`.
- The original adoption note was created on `feat/bitra-control-core-adoption`; the active implementation and PR work is on `feat/n3mak-workforce-control-core`.
- No production branch, deployment, environment secret, customer plan, payment setting or live bot configuration was changed.
- No BITRA package was installed into N3MAK; its trading-specific dependencies are not needed for this adoption.


## Implementation update — 2026-11-26

The workforce governance foundation now has a Node.js implementation on the feature branch:
- Strict task envelope and agent result validation, including a bounded objective.
- Role registry and default-deny capability checks.
- PostgreSQL task store with idempotency keys, status transitions, and append-only task events protected against UPDATE/DELETE.
- Bounded sequential orchestrator with task expiry, compare-and-set claim, model-call cap, per-call token allocation, evidence-reference validation, independent reviewer role, and zero external side effects.
- Constrained OpenAI-compatible LLM adapter using the existing N3MAK llm client and existing task routing.
- Owner-only Telegram pilot command `/agents`, guarded by the existing `OWNER_TELEGRAM_ID` configuration. It creates internal draft/review tasks only.

The pilot does not expose a general-purpose tool executor. Research tasks without supplied evidence must return `needs_evidence`; proposed actions are recorded as suggestions and never executed.

CI results from the earlier adoption branch: N3mak Bot CI and N3mak Gateway checks both completed successfully after the initial governance work. The new workforce runtime requires a fresh CI run on this branch before merge.

No deployment, migration against production, paid provider activation, payment operation, public publishing, repository write or deployment action was performed by the workforce runtime.


## Upstream re-check — 2026-11-26

The current upstream GitHub page now identifies the project as TRA, published as `bitra` on PyPI. The latest tagged release shown is v0.14.0 (2026-11-11). The repository default `develop` branch is active development; `master` is described as the stable release line. Pin a tagged release for any future source-level experiment and do not treat `develop` as production-stable.

Current upstream design details worth retaining as patterns:
- Deterministic policy and execution gates remain the core boundary between agent proposals and actions.
- Validators can construct independent pro and contra cases, followed by a neutral judge; code checks claims against data before accepting the verdict.
- Agent outputs that do not fit their schema can be retried with the validation reason.
- Event guard and market-specific cost/risk models are specific to trading and should not be copied into N3MAK unchanged.

The upstream README explicitly describes the project as experimental and says it has not been run with real capital by its authors. N3MAK therefore adopts design patterns only, not a production dependency on BITRA.


## Follow-up hardening — 2026-11-26

- Added `createAgentTaskStore({ db })` so PostgreSQL access can be injected for isolated tests while the bot keeps using the default pool-backed exports.
- Added `agent-task-store.test.js` covering atomic task-plus-audit insertion, idempotency conflict behavior, and rollback when a compare-and-set transition loses.
- These tests are committed on the feature branch. The available GitHub connector returned no workflow runs for the new commits, and no local repository runner was available in this session; test execution is therefore **not yet verified**.
- No live database was contacted, no migration was applied, and no deployment or merge was performed.
- Next hardening gate: run `cd bot && npm test` in CI; then test schema creation against an isolated PostgreSQL test database before considering merge.


## Workforce operations hardening — 2026-11-26

- Added bounded task event-history reads for owner diagnostics.
- Added an atomic expiry recovery query: overdue queued/running tasks are moved to `failed` and an append-only `task.expired_recovered` audit event is written in the same SQL statement.
- Recovery intentionally does **not** re-queue or replay expired work. The current worker adapter has no external side-effect executor, and replaying a timed-out model request could create duplicate work.
- Added legal status-transition enforcement in the store: queued → running/failed; running → completed/needs_evidence/refused/failed.
- Added owner-only Telegram commands: `/agents_task <uuid>` for task details and the latest audit events; `/agents_recover` for explicit expiry cleanup. `/agents_status` also performs safe expiry cleanup before listing.
- Reconciled the feature branch with the three latest `main` commits, preserving the readiness gate and adding the readiness policy/tests to this branch. The feature branch is now based on the latest main commit.
- Verification status for this hardening batch: unit-test code is committed; GitHub Actions results for the latest head have not yet been returned. Vercel build-rate-limit checks remain external preview failures. No production deployment or database migration was run.
