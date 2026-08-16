# Atlantis-X AI Workforce v2.2

## Operating model

Atlantis-X uses **autonomy by default with human authority at the top**. The CEO / Commander is the only strategic authority. AI employees may plan, execute, test, review, monitor and improve work within explicit policy boundaries.

```text
CEO / Commander
      │
      ▼
Orion — AI Chief of Staff / Orchestrator
      ├── Athena — Executive Secretary
      ├── Atlas — Project Manager
      │     └── Forge — AI CTO / Developer
      ├── Sentinel — Security Director
      ├── Pulse — Performance Director
      ├── Nexus — Intelligence Director
      │     ├── Meridian — Market & Country Intelligence
      │     ├── Nautilus — Blue Economy
      │     └── Aegis — Risk
      └── Nova — Marketing & PR
```

## Shared truth

`config/workforce.json` is the v2.2 workforce registry and the source of truth for every employee's identity, mission, skills, scoped memory contract, tools, permissions, KPIs, queue policy, communication channels, reporting line and escalation path. The local API combines that registry with runtime directives and derives each employee's live queue items, active count and Commander-waiting count.

The intended production knowledge core is:

1. PostgreSQL for structured operational truth.
2. A graph layer for entities, relationships and provenance.
3. Vector embeddings for semantic retrieval.
4. A source registry and confidence score for every intelligence claim.

The Command Center never labels an external integration as connected unless its credentials and health check are confirmed. In v2, GitHub is reported as locally available; Notion, Airtable and PostHog remain pending.

## Agent Runtime v2.2

Every task owns a persisted workflow with seven explicit stages:

```text
PLAN → EXECUTE → REVIEW → SECURITY → APPROVAL → RELEASE → COMPLETE
```

- **PLAN:** Atlas records scope, acceptance criteria and rollback intent.
- **EXECUTE:** the assigned employee creates a local sandbox work package. This stage cannot create an external side effect.
- **REVIEW:** an independent owner applies the separation-of-duties gate.
- **SECURITY:** Sentinel applies policy classification before release.
- **APPROVAL:** required only for a sovereign directive or critical task; the workflow stops until the CEO approves or rejects it.
- **RELEASE:** records a controlled local release. External adapters remain disabled in v2.
- **COMPLETE:** Athena closes the cycle and makes it available to executive reporting.

The runtime supports a single-step mode and an `until_gate` mode. CEO commands use `autorun: true` by default: Orion creates the task and the organization autonomously advances every safe local stage. A safe directive completes locally; a sovereign directive performs planning, isolated execution, independent review and security checks, then stops at `APPROVAL`. Every completed, waiting, approved, rejected or manual override transition creates an audit event with task, stage, employee, outcome and UTC timestamp. Workflow state is persisted transactionally in `.atlantisx/atlantisx.db` using SQLite, WAL and full synchronous durability. A previous `.atlantisx/runtime.json` is imported once without deleting the source backup.

## Command lifecycle

```text
CEO directive
  → Orion classifies intent
  → policy gate identifies sovereign/high-risk actions
  → Atlas creates a work item and assigns an executor
  → Runtime autonomously advances the safe local sandbox stages
  → Sentinel performs the security gate
  → CEO approval is requested when policy requires it
  → local release is recorded (no external side effect)
  → Athena closes and reports the cycle
```

The v2.2 routing and workflow engine is deterministic and auditable. It does not pretend that an LLM, GitHub write adapter, vulnerability scanner, external SaaS or deployment target is connected.

When `ATLANTISX_COMMANDER_KEY` is configured, it must be at least 16 characters and all control-plane routes require a constant-time checked Bearer key. The web client stores that key only in browser `sessionStorage`, can lock the session, and presents a non-dismissible authority gate after a `401`. Without the variable, the server remains available in explicitly labeled local single-user mode. This shared-key guard is not a replacement for TLS, OIDC or production multi-user authorization.

## Sovereign approval policy

The following always remain under CEO control:

- destructive data deletion;
- financial transfers or payments;
- release of sensitive information;
- critical security permission changes;
- high-risk production deployment;
- contracts and legal decisions;
- major strategy changes.

Sentinel may contain or stop a dangerous operation. It cannot make a strategic decision for the CEO.

## Self-improvement loop

Every proposed agent update follows:

```text
Measure → Evaluate → Identify weakness → Propose change
→ Sandbox test → Security review → Approval policy → Versioned release
```

Agent prompts, tools or policies are never silently self-modified in production. Pulse owns evaluation; Sentinel owns the security gate; the CEO owns strategic approval.

## Local API

- `GET /api/health` — public liveness and authentication-mode health.
- `GET /api/state` — shared Command Center, workflow, authority and audit state.
- `POST /api/commands` — route a CEO directive and, by default, autonomously run it to completion or approval.
- `POST /api/tasks/{id}/run` — execute one stage or continue until completion/approval gate.
- `POST /api/tasks/{id}/decision` — record a CEO approval/rejection and optional audit note.
- `POST /api/tasks/{id}/status` — manually update and reconcile task/workflow state.

All routes except health require `Authorization: Bearer ...` when `ATLANTISX_COMMANDER_KEY` is set. Runtime directives are stored under `.atlantisx/atlantisx.db`, which is intentionally ignored by Git. This web-runtime SQLite database is not encrypted and must not contain credentials; the native Tauri vault uses SQLCipher and Argon2 instead.

## Installable client and native vault

The web client is a Progressive Web App with an application manifest, service worker and platform icons. It can be installed without a terminal on Windows, Android, iOS/iPadOS, macOS and Linux. The service worker caches only the application shell and explicitly bypasses `/api` responses.

`src-tauri` provides the native Tauri 2 foundation. Its Rust vault uses SQLCipher full-database encryption and derives the key from a vault passphrase with Argon2. First run requires passphrase confirmation and states the no-recovery boundary before creating local storage. The key is retained only while the vault is unlocked and is zeroized when dropped. The encrypted schema covers goals, schedules, skills, capability grants and audit events. Native signed packages are not represented as available until each platform build and signing process actually succeeds.

## Capability activation policy

`config/capabilities.json` is a default-deny registry for desktop, browser, filesystem, Codework, Agent2Agent, provider and publishing capabilities. A native database constraint and the operating policy require all three gates before enablement:

1. explicit Commander permission with a narrow scope;
2. a successful adapter health check;
3. a tested, scoped rollback plan.

No external automation command is currently exposed. Adding credentials alone never enables a capability.

## Deployment boundary

The included container runs as a non-root user, exposes a health check and writes runtime state to a dedicated volume. `compose.yaml` refuses to start unless the commander key is supplied. HTTP security headers constrain content, browser capabilities and cross-origin resources while allowing the managed preview frame.

For public deployment, terminate TLS at a trusted reverse proxy, add rate limiting and centralized identity, restrict network access, back up the state volume, and replace the shared key with OIDC or another auditable identity provider. External execution remains disabled until each adapter has its own credentials, health check, minimum permission scope and rollback policy.
