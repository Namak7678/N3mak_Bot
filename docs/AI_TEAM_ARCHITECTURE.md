# N3mak AI Team — Integration Foundation

Status: design baseline; no production integrations or credentials changed.
Target repository: `Namak7678/N3mak_Bot`
Working branch: `integration/n3mak-ai-team-foundation`

## Objective

Build one governed AI team for N3mak that can be reached from the existing Telegram bot, a responsive web interface on iPhone/desktop, and the existing development/automation tools. Reuse the current bot and projects. Do not create a replacement Telegram bot, duplicate repositories, or paid infrastructure.

## Existing system to preserve

- Existing Telegram bot: `@N3mak_bot`
- Existing Node.js/Telegraf bot under `bot/`
- Existing monetization and checkout flows (Whop links in the root README)
- Existing gateway, database, Redis, deployment and automation components
- Existing command behavior, including `/ask`; add new capabilities without breaking current commands.

## Proposed control plane

- **Paperclip**: organization chart, task assignment, approvals, schedules, audit trail and budget guardrails.
- **Agent runtimes**: reuse already-running OpenClaw/Hermes/OmniRoute capabilities where healthy; add a new runtime only after a compatibility test. Paperclip is an orchestrator, not an LLM runtime.
- **Telegram**: existing N3mak bot remains the primary mobile entry point. Route new commands through an internal adapter to the team API; do not replace the bot token or create another bot.
- **iPhone + desktop**: responsive Paperclip web UI / mobile browser first. Native mobile app is not a phase-one dependency.
- **Automation**: reuse Zapier and Windmill for external workflows where already connected; use GitHub events/webhooks for development tasks.
- **Data**: reuse the existing database and project data. No database migration in phase one.

## Initial employee roster

1. CEO / Operations Coordinator — triage, delegate, consolidate results.
2. CTO / Technical Lead — architecture, code tasks and integration oversight.
3. Software Engineer — implementation in isolated branches and pull requests.
4. Research Analyst — market, competitor, tender and opportunity research.
5. Growth & Marketing — channel growth, campaign plans and content drafts.
6. Revenue & Sales — lead qualification, offers and sales pipeline support.
7. Customer Support — Telegram support drafts and escalation.
8. QA & Security — tests, permissions, secrets checks and release review.

Start with CEO, CTO, Research, Growth and QA only. Add the remaining roles after the first workflow passes acceptance tests.

## Permission policy

- Default to read-only access.
- Code changes go to feature branches and pull requests; no direct pushes to `main`.
- Production deploys, public posts, customer messages, purchases, payments, refunds, and account/security changes require explicit human approval.
- Never expose bot tokens, API keys, passwords, payment credentials, or personal data in prompts, logs, Git history, or reports.
- Apply per-agent least privilege; no shared unrestricted credential.
- Set zero discretionary spend by default. No paid plans, model credits, hosting, or add-ons without owner approval.

## Phase 1 — safe proof of concept

1. Verify Paperclip installation and its local authenticated access mode.
2. Create a N3mak organization and a small set of non-production agents.
3. Connect one low-risk agent runtime and verify task lifecycle, logs, approval gates and stop controls.
4. Add a Telegram adapter design for the existing bot, initially behind a feature flag and with no production token changes.
5. Verify mobile browser access from iPhone and desktop browser access.
6. Run a read-only workflow: Telegram request → CEO triage → Research agent → QA review → response back to the existing Telegram conversation.

## Acceptance criteria

- Existing `/ask`, payments, subscriptions and current bot behavior remain unchanged.
- One Telegram request can be assigned, tracked, reviewed and returned to the same conversation.
- The owner can inspect tasks and stop agents from desktop and iPhone browser.
- No agent can deploy, publish, spend, send external customer messages or alter production data without approval.
- No new paid service or duplicate bot/repository is introduced.
- Tests and a rollback path are documented before enabling production traffic.

## Candidate projects — verified shortlist

See [AI_TEAM_CANDIDATE_EVALUATION.md](AI_TEAM_CANDIDATE_EVALUATION.md) for the comparison and verification limits.

- **Paperclip** (MIT): primary management/control-plane candidate. Its README documents bring-your-own agents, organization/task management, approvals, permissions and cost tracking. It is not itself the LLM runtime.
- **MindRoom** (Apache-2.0): optional phone-first agent/chat candidate. Its README lists an iPhone/iPad app and Telegram through Matrix bridges; the existing N3mak bot integration still requires a proof-of-concept.
- **OpenAgents Workspace** (Apache-2.0): Windows-first collaborative workspace/agent launcher alternative; not selected for phase 1.
- **Synkora** (MIT): secondary self-hosted multi-channel candidate; verify resource footprint and claims before adoption.
- **jingsiqian/synapse** is a fork; the upstream project referenced by its README could not be verified during this review. Do not use it as a production foundation until provenance is resolved.
- **OriNachum/golem** is a fork and its README describes a separate Telegram bot per agent, conflicting with the one-existing-bot requirement. Do not use in phase 1.
- Do not install multiple competing orchestration platforms at once. Evaluate one runtime at a time.

## Current implementation boundary

This document and branch are a planning artifact only. No production bot code, credentials, database schema, deployment settings, or customer-facing behavior have been changed.
