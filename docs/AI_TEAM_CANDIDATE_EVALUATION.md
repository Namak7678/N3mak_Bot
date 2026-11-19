# N3mak AI Team — Candidate Evaluation

Date: 2026-11-19
Scope: open-source projects for one N3mak agent team, accessible from Windows, iPhone and the existing Telegram bot.
Decision status: shortlist for proof-of-concept; no third-party runtime installed and no production credentials connected.

## Executive decision

Do not install several orchestration platforms together.

Recommended architecture:
1. **Paperclip** as the management/control plane: company structure, agent assignments, goals, task history, approvals and cost visibility.
2. **Existing N3mak Telegram bot** remains the only Telegram entry point. Add an adapter to the current Telegraf application only after an isolated test.
3. **Existing N3mak web app** is the first desktop/iPhone browser surface. Evaluate Paperclip's own web UI on mobile as a secondary operator console.
4. **MindRoom** is the strongest candidate for a phone-first agent chat experience because its project README explicitly lists an iPhone/iPad app and Telegram through Matrix bridges. It is an optional runtime/client candidate, not an automatic addition.
5. **OpenAgents Workspace** is the strongest alternative for a Windows-first collaborative workspace and agent launcher. It does not replace the existing Telegram bot by itself.
6. **Synkora** is a secondary self-hosted multi-channel platform candidate; verify resource footprint and exact integrations before adoption.

## Candidate matrix

| Project | Verified repository facts | Fit for N3mak | Decision |
|---|---|---|---|
| Paperclip — https://github.com/paperclipai/paperclip | README describes an open-source Node.js server + React UI to orchestrate agents, goals, tasks, skills, permissions and costs. MIT license. Bring-your-own agents and providers. | Excellent management layer. Not an LLM runtime. Mobile browser needs hands-on validation; no native iOS app is assumed. | Adopt as control-plane candidate; test first. |
| MindRoom — https://github.com/mindroom-ai/mindroom | README says Apache-2.0, supports self-hosting and local/cloud models; agents can be reached through MindRoom Chat, Matrix clients, Slack, Telegram/WhatsApp/Discord bridges; README lists iPhone/iPad app. | Best explicit iPhone + chat-channel fit. Telegram route is via Matrix bridge, so integration with the existing bot must be tested; do not create a replacement bot. | Test as optional agent/chat runtime after Paperclip baseline. |
| OpenAgents — https://github.com/openagents-org/openagents | README says Apache-2.0; provides a shared agent workspace and launcher. Documents a Windows PowerShell installer and agent connection workflow. | Good Windows collaboration/launcher candidate. Existing Telegram bot integration and native iOS app are not established by the README reviewed. | Keep as alternative; do not install in phase 1. |
| Synkora — https://github.com/getsynkora/synkora-ai | README says MIT, self-hosted, supports Telegram, web widget and REST API, and advertises a web UI, integrations, RAG and approval gates. | Potential all-in-one runtime and direct Telegram channel. Claims and resource requirements need verification; native iOS app not established. | Secondary benchmark only. |
| Synapse fork — https://github.com/jingsiqian/synapse | Repository metadata identifies it as a fork. Its README advertises desktop/web/mobile and multiple chat platforms, but the upstream URL referenced by its README could not be verified (404 during this check). | Provenance and maintenance risk. | Do not use as a production foundation until upstream/provenance is resolved. |
| Golem fork — https://github.com/OriNachum/golem | Repository metadata identifies it as a fork. README says each agent connects to its own Telegram bot and describes OpenRouter dependency. | Conflicts with N3mak requirement to preserve one existing Telegram bot; likely duplicates channels and may incur model costs. | Do not adopt for phase 1. |

## Existing N3mak integration points verified in GitHub

Repository: https://github.com/Namak7678/N3mak_Bot

- `bot/` is an existing Node.js application using Telegraf.
- `bot/src/` contains existing command, bot instance, database, LLM, payments, scheduler, webhook and reporting modules.
- `web/` contains an existing Next.js application.
- `gateway-worker/` exists with a schema and worker source.
- Root README identifies the existing Telegram bot as `@N3mak_bot`.

Therefore: extend the current bot and web app; do not create a new Telegram bot, new web product, or duplicate repository.

## Phase 1 implementation sequence

1. Install and start Paperclip locally on the Windows computer.
2. Verify login, dashboard, agent runtime configuration, logs, task state, approval controls and stop/pause behavior.
3. Create only five non-production roles initially: CEO/Coordinator, CTO, Research, Growth and QA/Security.
4. Run a no-write task using a supported existing agent runtime; do not grant shell, deploy, payment or production database permissions.
5. Check the Paperclip web UI on iPhone Safari and desktop browser.
6. Only after the above passes, design an internal API adapter in the existing Telegraf bot, protected by a feature flag.
7. Test a read-only request from the existing Telegram bot through coordinator → specialist → QA → same Telegram conversation.
8. Evaluate MindRoom's iPhone app and Telegram bridge separately; add it only if it provides a real capability not already covered.

## Hard safety and cost boundaries

- No new Telegram bot or token.
- No new paid hosting, model subscriptions, API credits or managed plans without owner approval.
- Default agent access is read-only.
- No direct commits to `main`; code changes use feature branches and pull requests.
- No production deployments, public posts, outbound customer messages, payments, refunds, purchases, account changes or destructive database operations without explicit owner approval.
- Never put secrets in GitHub, prompts, task descriptions or logs.
- Keep existing payments, subscriptions, commands and webhook behavior unchanged.

## Acceptance tests

- Paperclip starts and its dashboard is reachable on the Windows computer.
- Dashboard is usable from iPhone Safari, or a documented limitation is recorded.
- Existing N3mak bot continues to respond to its current commands.
- One read-only Telegram request is tracked as a Paperclip task and returns to the same conversation.
- Agent stop/pause and human approval gates are demonstrated.
- No paid service or duplicate bot/repository is introduced.
- Existing bot tests and build are run locally before any production rollout.

## Verification limits

This evaluation is based on repository metadata, README contents, and LICENSE files fetched from GitHub on 2026-11-19. It is not a security audit or an installation test. Feature claims from project READMEs remain vendor-maintained claims until reproduced locally. No software has been installed on the user's PC by this document update.
