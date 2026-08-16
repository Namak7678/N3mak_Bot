# Atlantis-X v2.4.0 operations and execution runbook

This runbook explains what Atlantis-X actually executes, how to operate the installable PWA, how Orion uses a connected model, and what remains required before native or external-automation release.

## 1. Release truth matrix

| Surface | Current state | What is genuinely verified | What is not claimed |
|---|---|---|---|
| Web application | Installable PWA | Static shell, manifest, icons, service worker, API exclusion from cache | A PWA is not a signed desktop/mobile binary |
| Local web runtime | Python + SQLite | State persistence, workflow gates, audit records, protected API, readiness checks | Web SQLite is not encrypted and must not contain credentials |
| Orion CTO | Session-only BYOK | Six adapter families, live challenge gate, structured planning, bounded continuity, bounded plan revisions | No provider account is connected by default |
| Internal workforce | 11 coordinated roles | Orion delegates one ordered plan and remains accountable to the Commander | Delegation does not execute an external tool |
| Native application | Tauri/SQLCipher source | Source-level vault/runtime/provider implementation and configuration | Rust source is uncompiled here; no installer is ready |
| External automation | Disabled | Seven capabilities remain default-deny | No browser, desktop, payment, publishing, or deployment effect is enabled |

## 2. What happens when the Commander enters a goal

### With a verified provider

1. The UI sends the goal to `POST /api/cto/run`.
2. The server obtains local counts, the 11 role identifiers, and at most four recent Orion plan summaries.
3. Continuity is bounded and sanitized: full prior model answers, provider payloads, stored provider credentials, and unstructured audit logs are excluded. Common credential-shaped assignments in persisted summaries are redacted.
4. Orion sends the goal and bounded context to the already verified provider session.
5. The model must return one JSON plan containing:
   - executive summary and useful answer;
   - risk and approval recommendation;
   - assumptions and measurable success metrics;
   - an ordered delegation list with rationale, deliverable, dependencies, effort, acceptance criteria, and per-step approval;
   - one concrete next action.
6. Atlantis-X normalizes lengths, limits list sizes, allows only the 11 registered role IDs, and rejects malformed plans.
7. Only after successful inference and normalization does the server create a task.
8. Orion remains the accountable owner. The first non-Orion delegate becomes lead executor, while every unique delegate sees the task in its queue.
9. Deterministic sovereign-term checks and model risk are combined conservatively. Either can require Commander approval.
10. The plan is staged with `execution_scope: ai_planning_only`; no external side effect is reported as executed.
11. Evidence is recorded in separate fields: provider inference succeeded, plan persistence succeeded, and external execution was neither performed nor verified.
12. The UI renders the detailed steps and can download a portable Markdown execution brief; downloading the file is a local browser action, not an external execution claim.

### When the Commander refines an existing plan

1. The result dialog sends the task ID and a bounded instruction to `POST /api/tasks/{id}/cto/refine`.
2. The server accepts only a persisted `ORION AI CTO` task. It captures the plan's generation marker and revision number before inference.
3. Orion receives the original goal, one sanitized summary of the current plan, registered role IDs, and the Commander's instruction. The full previous answer is excluded.
4. The prompt requires a complete replacement plan—not a patch—using the same detailed schema and all safety gates.
5. If provider inference or normalization fails, the persisted task is untouched.
6. Before writing, the server verifies that the plan marker has not changed concurrently. A stale revision is rejected and must be retried from the latest plan.
7. The new plan receives the next monotonic revision number. Delegated queues and lead executor are recomputed.
8. Existing approval requirements are preserved even if the replacement model response reports lower risk. New high-risk output can add an approval requirement.
9. The old full plan is replaced. Only a bounded, redacted history of the latest six revision summaries is retained.
10. Workflow approvals and stage progress are reset: the replacement plan is recorded as a completed planning stage, while external execution remains disabled.
11. The UI shows the revision and evidence boundary, and the downloaded Markdown brief includes both.

This design gives the Commander an iterative planning loop without representing model text as completed work, replaying full prior answers, accumulating unbounded memory, or allowing a revision to inherit stale approval evidence.

### Without a verified provider

The UI uses `POST /api/commands`. Orion performs deterministic local routing and workflow-state transitions. This path is labeled local/deterministic and must not be presented as model reasoning.

## 3. End-user installation and setup

No Docker or terminal is required for a hosted end user.

1. Open the HTTPS Atlantis-X URL.
2. Select **تثبيت التطبيق / Install Atlantis-X**.
3. Windows and Android: accept the Edge/Chrome install prompt.
4. iPhone/iPad: Safari → Share → Add to Home Screen.
5. macOS/Linux: use the browser's PWA install control when supported.
6. Open **ORION CTO · SETUP**.
7. Select the provider. Review the prefilled endpoint and model; these are editable because account availability varies.
8. Enter the user's own key, grant model-only access, and confirm disconnect-and-forget rollback.
9. Select **Verify provider & activate CTO**. The LIVE state appears only after the provider returns exactly `ATLANTIS_OK` to a real inference request.
10. Enter a goal. Review risk, assumptions, metrics, ordered steps, dependencies, acceptance checks, and the explicit no-side-effect boundary.
11. To revise it, enter one specific instruction in **REFINE WITH ORION**. Review the incremented revision and reset approval state before proceeding.
12. Confirm **VERIFIED EVIDENCE** still says that external execution was not performed, then download the `.md` brief when a portable execution plan is needed.
13. Disconnect Orion when finished. This clears the key from server-process memory.

The web key is session-only. Process restart also forgets it. Do not enter provider secrets into the goal or a refinement instruction.

## 4. Operator deployment procedure

### 4.1 Prerequisites

- Python 3.9 or newer.
- Persistent writable storage for `.atlantisx/atlantisx.db`.
- HTTPS termination through a trusted reverse proxy.
- A random `ATLANTISX_COMMANDER_KEY` of at least 16 characters, injected from the deployment secret store.
- Network egress only to provider endpoints the operator intends to support.

### 4.2 Preflight validation

Run from the repository root:

```bash
python -m py_compile server.py cto_agent.py
python -m unittest discover -s tests -v
node --check web/app.js
node --check web/service-worker.js
for file in config/workforce.json config/capabilities.json config/providers.json \
  src-tauri/tauri.conf.json package.json package-lock.json web/manifest.webmanifest; do
  python -m json.tool "$file" >/dev/null || exit 1
done
git diff --check
```

If Rust and required native SDKs are unavailable, record native checks as **not run**. Never substitute static source inspection for successful native compilation.

### 4.3 Start the web service

```bash
export ATLANTISX_COMMANDER_KEY="a-random-value-from-the-secret-store"
python server.py --host 0.0.0.0 --port 4173
```

Do not place the key in source, an image layer, a committed environment file, or browser JavaScript.

### 4.4 Health and readiness

- `GET /api/health` is unauthenticated liveness. It answers whether the HTTP process is alive.
- `GET /api/readiness` is a protected operational check. Send `Authorization: Bearer <Commander key>`.
- Readiness verifies the 11-role/one-Orion registry, SQLite `PRAGMA quick_check`, the external-automation lock, and required PWA assets.
- Provider inference is an optional readiness check. The application remains ready for deterministic local operation when no BYOK session is connected.
- A failed required check returns HTTP 503 with `status: degraded`.

Example operator check:

```bash
curl --fail http://127.0.0.1:4173/api/health
curl --fail -H "Authorization: Bearer $ATLANTISX_COMMANDER_KEY" \
  http://127.0.0.1:4173/api/readiness
```

### 4.5 Reverse proxy requirements

- Terminate TLS with a valid certificate.
- Forward the original host and protocol.
- Set conservative request-body and connection timeouts.
- Add rate limiting to authentication and CTO inference routes.
- Do not cache `/api/*` responses.
- Restrict administrative access at the identity-aware proxy when possible.
- Prefer OIDC or another per-user identity layer before public/multi-user exposure; the current Commander key is a shared single-user boundary.

### 4.6 Persistence, backup, and restore

1. Keep `.atlantisx` on persistent storage.
2. Quiesce writes or use SQLite's backup API before copying a live database; do not copy only the main file while ignoring active WAL state.
3. Encrypt backups in the deployment storage system.
4. Restore into a staging instance first.
5. Call protected readiness and load `/api/state`.
6. Confirm task counts, approval gates, and latest audit events before promoting the restored instance.

The web database is unencrypted. Never use it as a credential vault. Native SQLCipher is a separate target runtime.

## 5. Provider operations

### Supported web protocol families

- OpenAI-compatible
- Azure OpenAI
- Anthropic Messages
- Google Gemini GenerateContent
- Cohere v2 Chat
- Ollama local Chat

AWS Bedrock remains unavailable because SigV4 request signing is not implemented.

### Security controls

- Hosted endpoints require HTTPS on port 443 and are pinned to the selected catalog host.
- Azure permits validated subdomains of `openai.azure.com`.
- Local adapters permit HTTP only on loopback.
- Redirects are rejected.
- Provider responses are limited to 1 MiB.
- Response and plan errors are sanitized before reaching the UI.
- OpenAI's first-party adapter uses `max_completion_tokens`; generic OpenAI-compatible adapters retain `max_tokens` for compatibility.

A catalog model is only a suggested default. The operator/user must confirm that the exact model is enabled in their account and region.

## 6. Rollback and incident response

### Provider incident

1. Select **Disconnect & forget key**.
2. Restart the Python process if session-memory compromise is suspected.
3. Revoke/rotate the key at the provider.
4. Review local audit/task records; they do not contain the provider key by design.
5. Reconnect only after the endpoint, quota, model, and account activity have been reviewed.

### Runtime integrity failure

1. Remove the instance from traffic when readiness returns 503.
2. Preserve the database and WAL files for investigation.
3. Do not repeatedly run workflows against a failed integrity check.
4. Restore the latest validated encrypted infrastructure backup into staging.
5. Re-run the full preflight and readiness procedure.

### Unexpected external-effect state

1. Stop the service.
2. Inspect `config/capabilities.json`; all capabilities should remain disabled.
3. Review the commit diff and deployment configuration.
4. Do not resume until permission, health, least-privilege scope, idempotency, audit, and tested rollback exist for the capability.

## 7. External automation activation gate

This release deliberately has no general external executor. A future capability must not be marked enabled until all of these exist:

1. One named business function and one responsible internal role.
2. Explicit Commander permission with a narrow scope.
3. Credentials in a suitable encrypted/OS-managed vault.
4. Real account health verification.
5. Preview/dry-run behavior where the provider supports it.
6. Idempotency or duplicate-effect prevention.
7. Timeouts, bounded retries, and circuit breaking.
8. Immutable request/decision/result audit without secrets.
9. A tested rollback or compensating action.
10. A sovereign approval gate for money, publication, deletion, contracts, sensitive data, critical permissions, production deployment, or major strategy.
11. Integration tests using a user-controlled sandbox account.
12. A kill switch independent from the model.

Until then, deterministic workflow stages are state transitions and audit records—not proof that outside work occurred.

## 8. Native release procedure and remaining work

The repository contains Tauri 2 / Rust / SQLCipher source at package revision 2.4.0. It has not been compiled in the current environment. `npm ci` and the repository-local Tauri CLI 2.11.4 are verified, and `npm run native:info` completes successfully; its environment report confirms that `rustc`, Cargo, `webkit2gtk-4.1`, and `rsvg2` are missing. `npm run native:build` was attempted and stopped before compilation because the CLI could not execute `cargo metadata`. Android/iOS SDK and signing prerequisites are also unavailable. Diagnostic or dependency-install success is not a native build.

A multi-platform, no-production-signing CI definition is available at `docs/workflows/native-build.yml.example`. It remains inert until a repository owner copies it to `.github/workflows/native-build.yml`. GitHub rejected the current App's direct workflow push because the installation does not have the `workflows` permission. Grant **Workflows: Read and write** to that App (then approve/reconnect the installation), or install the file through another owner-controlled GitHub identity with workflow-management permission. The active definition can then be dispatched manually. Treat its desktop bundles, Android debug APK, and iOS simulator app as short-lived verification evidence, never as a public signed release.

### Desktop

1. Install Rust 1.77.2+ and Tauri system prerequisites on each target OS.
2. Run `npm ci`, `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`, `cargo test --manifest-path src-tauri/Cargo.toml`, and `npm run native:build`.
3. Test vault create/unlock/lock, wrong key, schema migration, crash recovery, provider health, and workflow concurrency.
4. Sign Windows artifacts with Authenticode.
5. Sign and notarize macOS artifacts with Apple Developer credentials.
6. Build Linux packages on the supported distribution baseline.

### Android

1. Use a trusted builder with Java, Android SDK/NDK, Rust Android targets, and a release keystore held in encrypted CI secrets.
2. Run `npm run native:android:init` and `npm run native:android:build`.
3. Test background suspension, process death, vault relock, network permission, update, and rollback on physical devices.
4. Produce a signed AAB/APK, checksums, privacy disclosure, and Play release evidence.

### iOS

1. Use macOS with Xcode, Apple Developer identity, and provisioning profiles stored outside Git.
2. Run `npm run native:ios:init` and `npm run native:ios:build`.
3. Test Keychain/biometric wrapping decisions, app suspension, protected-data availability, backup policy, and device restore.
4. Archive, sign, and submit through TestFlight before public release.

No `.exe`, `.msi`, `.dmg`, `.apk`, `.aab`, or `.ipa` is ready until these target builds, signatures, and device tests succeed.

## 9. Release acceptance checklist

- [ ] Python compilation passes.
- [ ] All unit tests pass.
- [ ] JavaScript syntax and all JSON files validate.
- [ ] `git diff --check` passes.
- [ ] Liveness returns 200.
- [ ] Protected readiness returns `ready: true`.
- [ ] PWA install and offline shell are tested in real browsers.
- [ ] API responses are not present in service-worker cache.
- [ ] Commander authentication is supplied from secret storage.
- [ ] A real user-owned provider passes the health challenge, if model planning is advertised.
- [ ] High-risk goals stop at the Commander gate.
- [ ] External capabilities remain disabled unless their complete activation gate is evidenced.
- [ ] Backup and restore are tested.
- [ ] Native claims are limited to source unless compilation/signing/device evidence exists.

## 10. Source-of-truth files

- `server.py`: web runtime, persistence, continuity, readiness, and policy gates.
- `cto_agent.py`: provider transport, prompt contract, and structured plan normalization.
- `web/app.js`: graphical setup, model/local routing, detailed plan display, and Markdown export.
- `config/workforce.json`: 11-role organization and Commander reporting lines.
- `config/capabilities.json`: default-deny external-effect policy.
- `config/providers.json`: provider catalog and suggested models.
- `src-tauri`: uncompiled native source foundation.
- `docs/workflows/native-build.yml.example`: owner-installable unsigned/development native verification pipeline.
- `docs/NATIVE_APP.md`: native packaging/signing boundary.
