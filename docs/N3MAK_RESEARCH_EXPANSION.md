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
