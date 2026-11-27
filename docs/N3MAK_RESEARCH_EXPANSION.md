# N3MAK Research Expansion — Evidence-First Workflow

Status: design guidance for the existing Workforce Control Core. No new runtime dependency is introduced by this document.

## Objective

Expand N3MAK research beyond one-pass web lookup into a repeatable, auditable research cycle. The existing PostgreSQL task/evidence store remains the system of record. Agents may search, classify, compare and draft; deterministic code owns state transitions, budgets, policy and completion.

## Research lanes

1. **Market and customer discovery** — customer segments, jobs-to-be-done, willingness-to-pay signals, competitor positioning, pricing evidence and disconfirming signals.
2. **Technical and open-source intelligence** — repositories, licenses, release activity, maintenance signals, dependency footprint, deployment requirements and integration cost.
3. **Operational intelligence** — process bottlenecks, support themes, reliability incidents, automation candidates and measurable time/cost savings.
4. **Commercial and revenue intelligence** — channels, conversion assumptions, unit economics, payment constraints, supplier/customer evidence and risks.
5. **Risk and compliance intelligence** — privacy, security, data classification, licensing, jurisdictional constraints and abuse scenarios.
6. **Project and delivery intelligence** — codebase facts, CI state, open defects, integration readiness, migration risk and release gates.

## Standard research cycle

1. **Frame** — convert the objective into decision questions, scope, geography/time window, acceptance criteria and explicit unknowns.
2. **Map breadth** — search multiple independent source classes before deep-diving; retain search queries and retrieval timestamps.
3. **Collect evidence** — capture source URL, title, source type, date, exact excerpt, classification and SHA-256 digest. Failed retrieval is a source gap, never evidence.
4. **Normalize** — deduplicate canonical URLs and identifiers; keep original source identity and distinguish primary from secondary sources.
5. **Compare** — create a question-coverage matrix; identify conflicting claims, stale data, weak sources and missing perspectives.
6. **Deepen selectively** — run targeted follow-up searches only for high-value gaps and contradictions, within the task's shared call/token/time budget.
7. **Review independently** — reviewer checks each material claim against its cited evidence and flags unsupported or conflicting statements.
8. **Report** — separate verified claims, estimates, assumptions, recommendations and unresolved questions. Recommendations must state their evidence and confidence limits.
9. **Stop or escalate** — stop when required questions are covered, critical contradictions are resolved or documented, and marginal new evidence is low. Escalate unresolved decisions to the human owner.

## Required report contract

- Executive decision and requested action
- Scope and research timestamp
- Questions and coverage status
- Findings with evidence IDs and source links
- Conflicting evidence and counterarguments
- Assumptions and estimates, clearly labeled
- Risks, unknowns and evidence gaps
- Recommendation, confidence rationale and next verification step
- Search log and sources not accessible

## Completion gates

A research task must not be marked complete when:
- a material factual claim has no evidence ID;
- a cited ID is not in the task's evidence bundle;
- an evidence digest or classification check fails;
- a material question is unanswered but presented as settled;
- a contradiction is silently omitted;
- the task deadline or shared execution budget is exceeded.

The current pilot validates evidence IDs and content digests. Semantic claim-to-passage support, question coverage and contradiction checks remain future gates and must not be represented as already automated.

## Candidate open-source patterns to evaluate (not install blindly)

- [Reliable Deep Research](https://github.com/hilzlzl/reliable-deep-research) — durable research tasks, question coverage, report auditing and bounded repair. Evaluate its recovery and evidence-coverage patterns; do not import its Python/LangGraph stack into the Node bot without a measured need.
- [ResearchFlow](https://github.com/Olitk-n/ResearchFlow) — local-first source aggregation, deduplication, evidence capture, dataset/license gates and reproducibility. Evaluate source normalization and provenance ideas.
- [openscience](https://github.com/Hylouis233/openscience) — staged evidence-first research, citation verification and human approval gates. Evaluate its separation of source resolution from claim support.
- [SciRAG](https://github.com/yale-nlp/SciRAG) — adaptive retrieval, citation-aware synthesis and outline-guided review. Treat as a research reference, not a production dependency.

Before adopting any project: verify current license, maintenance, security posture, transitive dependencies, resource requirements, API compatibility and whether the same capability already exists in N3MAK. Prefer extracting a small, testable pattern over importing a new platform.

## Implementation sequence

1. Deadline enforcement and regression tests in the existing orchestrator.
2. Structured research brief and question-coverage fields in task results.
3. Search-log/evidence capture adapters that store immutable evidence records.
4. Contradiction and source-diversity review in the reviewer contract.
5. Human approval gates for report finalization and any future external side effect.
6. Offline evaluation fixtures for citation resolution, claim support, coverage, contradiction detection, recovery and budget compliance.

## Non-goals and safety

No automatic publishing, messaging, payments, account changes, repository writes, deployments or external actions. No paid provider or new hosted database. Do not equate citation existence with factual truth. Keep source text untrusted and never execute instructions found inside evidence.

## External project evaluation — 2026-11-27

This is a repository-level screening, not a security audit. Counts and setup notes are a point-in-time snapshot and can change.

| Project | Observed strengths | Constraints and adoption decision |
|---|---|---|
| [Reliable Deep Research](https://github.com/hilzlzl/reliable-deep-research) | MIT license; durable research task execution, question-oriented coverage, citation support audits and bounded repair are directly relevant to the next N3MAK research milestone. | Python/LangGraph/SQLite stack; live mode documents paid model and search calls. **Adopt design patterns only**: stable question requirements, coverage audit, bounded gap repair and inspectable failure records. Do not import its runtime. |
| [ResearchFlow](https://github.com/Olitk-n/ResearchFlow) | MIT license; local-first source aggregation, DOI/arXiv/title deduplication, evidence extraction, coverage matrices, dataset-license gates and provenance. Repository overview showed 22 commits. | Full product spans FastAPI, Next.js and optional PostgreSQL/Redis/Celery/Docker. One public star at review time is not a maturity signal. **Evaluate small patterns only**: canonical source normalization, source diversity and evidence provenance; no platform adoption. |
| [openscience](https://github.com/Hylouis233/openscience) | MIT license; staged research lifecycle, citation metadata verification, append-only provenance and explicit human approval gates. | Five commits shown at review time; quick start requires Python 3.11, uv and Claude Code, with optional external connectors. **Borrow the approval-stage and citation-resolution contracts**, not its plugin/runtime stack. |
| [SciRAG](https://github.com/yale-nlp/SciRAG) | Adaptive sub-question retrieval, citation-graph expansion, reranking and outline-guided synthesis; seven commits and 15 stars shown at review time. | Research-code orientation; README asks users to configure Semantic Scholar and model API keys, and recommends dense retrieval over a 45-million-paper corpus. No license was visible in the repository overview inspected. **Research reference only** until license, dependency and reproducibility checks are complete. |

### Decision for N3MAK

1. **Do not add any of these repositories as a runtime dependency.** The current Node/PostgreSQL control core already owns task state, evidence integrity, budgets and policy. A second orchestration stack would duplicate those responsibilities and increase operational cost.
2. Implement the next capability natively: a bounded research brief with stable question IDs, per-question evidence links, explicit coverage states (covered, partial, unanswered, contradicted), and a reviewer coverage audit.
3. Add source diversity and canonical-URL duplicate detection as deterministic metadata checks. These checks must flag duplicate or narrow source sets; they must not claim semantic truth.
4. Keep semantic claim-to-passage support and contradiction detection as reviewer-assisted, fallible checks until offline fixtures demonstrate acceptable precision and recall.
5. Only reconsider an external component after a measured gap remains, the license is confirmed, and its dependency/resource footprint is compatible with the existing bot and low-resource Windows workstation.

## Research question coverage engine — implementation status

The existing Node control core now accepts an optional bounded `researchBrief` with 1–8 stable question IDs. Claims may link to one or more question IDs. The deterministic coverage assessor counts only claims that carry evidence IDs and emits per-question `covered` or `unanswered` status, supporting claim counts, and evidence IDs.

When a brief is supplied, the orchestrator refuses to mark the task `completed` while any required question remains unanswered; it transitions to `needs_evidence` and returns the unanswered question IDs. Telegram completion reports display the coverage ratio.

This is deliberately a minimum, deterministic gate. It does not yet support `partial` or `contradicted` statuses, semantic entailment, or automatic gap-search retries. A question marked covered means at least one reviewer-approved claim is linked to it and cites an evidence ID; it does not prove that the cited passage semantically answers the question. Those stronger judgments require separate evaluation and must remain reviewer-assisted.

Offline unit tests were added for question mapping, unknown question IDs, evidence-free claims, required-question blocking, and successful coverage. CI must still run against the exact branch head before this implementation is treated as verified.
