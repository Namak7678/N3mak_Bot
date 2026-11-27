'use strict';

const { validateTaskEnvelope, validateAgentResult, validateEvidenceReferences, validateClaimSupport } = require('./task-contract');
const { getRoleCapabilities } = require('./registry');
const { evaluateToolRequest } = require('./policy-gate');
const { verifyEvidenceRecord, assessEvidenceDiversity } = require('./evidence-contract');
const { assessQuestionCoverage } = require('./research-coverage');
const { assessContradictionCandidates } = require('./contradiction-review');
const { assessEvidenceSupport } = require('./evidence-support-review');
const { buildResearchGapPlan } = require('./research-gap-planner');

const TERMINAL = new Set(['completed', 'needs_evidence', 'refused', 'failed']);

function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('agent_timeout'), { code: 'AGENT_TIMEOUT' })), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function createOrchestrator({ store, runAgent, clock = () => new Date() } = {}) {
  if (!store || typeof store.createTask !== 'function' ||
      typeof store.getTask !== 'function' ||
      typeof store.transitionTask !== 'function' ||
      typeof store.appendEvent !== 'function') {
    throw new TypeError('invalid_task_store');
  }
  if (typeof runAgent !== 'function') throw new TypeError('runAgent_required');

  async function submit(task) {
    validateTaskEnvelope(task);
    const created = await store.createTask(task);
    return { ...created, status: created.task?.status || 'queued' };
  }

  async function run(taskId) {
    if (typeof taskId !== 'string' || !taskId.trim()) throw new TypeError('invalid_task_id');
    const record = await store.getTask(taskId);
    if (!record) return { status: 'not_found', taskId };

    const task = record.payload;
    validateTaskEnvelope(task);
    if (TERMINAL.has(record.status)) return { status: record.status, taskId, result: record.result || null };
    if (record.status !== 'queued') return { status: record.status, taskId, busy: record.status === 'running' };

    const now = clock();
    if (Date.parse(task.expiresAt) <= now.getTime()) {
      await store.transitionTask(taskId, 'queued', 'failed', {
        error: { code: 'TASK_EXPIRED' },
      });
      return { status: 'failed', taskId, error: 'TASK_EXPIRED' };
    }

    const claimed = await store.transitionTask(taskId, 'queued', 'running', {
      event: { type: 'task.started', actor: 'orchestrator' },
    });
    if (!claimed) return { status: 'busy', taskId };

    const results = [];
    let calls = 0;
    const taskExpired = () => Date.parse(task.expiresAt) <= clock().getTime();
    const maxTokensPerCall = Math.max(1, Math.floor(task.budget.maxTokens / task.budget.maxModelCalls));
    const roles = task.roles.filter((role) => role !== 'reviewer');
    const reviewerAssigned = task.roles.includes('reviewer');

    async function fail(status, code, details = {}) {
      const result = { status, code, ...details };
      const transitioned = await store.transitionTask(taskId, 'running', status, {
        result,
        error: { code },
        event: { type: `task.${status}`, actor: 'orchestrator', payload: { code } },
      });
      if (!transitioned) return { taskId, status: 'stale', code: 'TASK_STATE_CHANGED' };
      return { taskId, ...result };
    }

    const evidenceBundle = [];
    if (task.evidenceIds.length && typeof store.getEvidence !== 'function') {
      return fail('needs_evidence', 'EVIDENCE_STORE_UNAVAILABLE');
    }
    const classificationRank = { public: 0, internal: 1, confidential: 2, restricted: 3 };
    try {
      for (const evidenceId of task.evidenceIds) {
        const evidence = await store.getEvidence(evidenceId);
        if (!evidence) return fail('needs_evidence', 'EVIDENCE_RECORD_NOT_FOUND', { missingEvidenceIds: [evidenceId] });
        if (evidence.evidence_id !== evidenceId || !verifyEvidenceRecord(evidence)) {
          return fail('failed', 'EVIDENCE_INTEGRITY_CHECK_FAILED', { evidenceId });
        }
        if (!(classificationRank[task.dataClassification] >= classificationRank[evidence.classification])) {
          return fail('refused', 'EVIDENCE_CLASSIFICATION_MISMATCH', { evidenceId });
        }
        evidenceBundle.push({
          evidenceId: evidence.evidence_id,
          sourceType: evidence.source_type,
          sourceUrl: evidence.source_url,
          title: evidence.title,
          content: evidence.content_text,
          contentSha256: evidence.content_sha256,
          classification: evidence.classification,
          capturedAt: evidence.captured_at,
        });
      }
    } catch (error) {
      return fail('failed', 'EVIDENCE_LOOKUP_FAILED');
    }

    for (const role of roles) {
      if (taskExpired()) return fail('failed', 'TASK_EXPIRED');
      if (calls >= task.budget.maxModelCalls) return fail('failed', 'MODEL_CALL_BUDGET_EXHAUSTED');
      const remainingMs = Math.max(1, Math.min(task.budget.timeoutMs, Date.parse(task.expiresAt) - clock().getTime()));
      const allowedTools = getRoleCapabilities(role).filter((tool) => task.allowedTools.includes(tool));
      try {
        calls += 1;
        const raw = await withTimeout(runAgent({
          task,
          role,
          allowedTools,
          evidenceIds: [...task.evidenceIds],
          evidence: evidenceBundle,
          priorResults: results.map(({ role: priorRole, result }) => ({ role: priorRole, result })),
          reviewOnly: false,
          budget: { ...task.budget, maxTokens: maxTokensPerCall, remainingMs, callNumber: calls },
        }), remainingMs);
        if (taskExpired()) return fail('failed', 'TASK_EXPIRED');
        const result = validateAgentResult(raw);
        const evidence = validateEvidenceReferences(result, task.evidenceIds);
        if (!evidence.valid) {
          return fail('needs_evidence', 'UNKNOWN_EVIDENCE_REFERENCE', {
            role,
            unknownEvidenceIds: evidence.unknownEvidenceIds,
          });
        }
        const claimSupport = validateClaimSupport(result);
        if (!claimSupport.valid) {
          return fail('needs_evidence', 'UNSUPPORTED_CLAIMS', {
            role,
            unsupportedClaimIndexes: claimSupport.unsupportedClaimIndexes,
          });
        }
        if (result.status !== 'completed') {
          return fail(result.status, `AGENT_${result.status.toUpperCase()}`, { role, summary: result.summary });
        }

        const proposedActionDecisions = result.proposedActions.map((action) => {
          const decision = evaluateToolRequest({ role, tool: action.tool, task });
          return {
            tool: action.tool,
            policyAllowed: decision.allowed,
            reason: decision.allowed ? 'execution_disabled_in_workforce_pilot' : decision.reason,
          };
        });
        const blockedActions = proposedActionDecisions.filter((action) => !action.policyAllowed);
        results.push({ role, result, blockedActions, proposedActionDecisions });
        await store.appendEvent(taskId, {
          type: 'agent.completed',
          actor: role,
          payload: {
            claims: result.claims.length,
            proposedActions: proposedActionDecisions,
            blockedActions,
          },
        });
      } catch (error) {
        return fail('failed', error.code || 'AGENT_EXECUTION_FAILED', { role });
      }
    }

    let finalReview = null;
    let reviewActionDecisions = [];
    if (reviewerAssigned) {
      if (taskExpired()) return fail('failed', 'TASK_EXPIRED');
      if (calls >= task.budget.maxModelCalls) return fail('failed', 'MODEL_CALL_BUDGET_EXHAUSTED');
      const remainingMs = Math.max(1, Math.min(task.budget.timeoutMs, Date.parse(task.expiresAt) - clock().getTime()));
      try {
        calls += 1;
        const raw = await withTimeout(runAgent({
          task,
          role: 'reviewer',
          allowedTools: getRoleCapabilities('reviewer').filter((tool) => task.allowedTools.includes(tool)),
          evidenceIds: [...task.evidenceIds],
          evidence: evidenceBundle,
          priorResults: results.map(({ role, result, blockedActions }) => ({ role, result, blockedActions })),
          reviewOnly: true,
          budget: { ...task.budget, maxTokens: maxTokensPerCall, remainingMs, callNumber: calls },
        }), remainingMs);
        if (taskExpired()) return fail('failed', 'TASK_EXPIRED');
        finalReview = validateAgentResult(raw);
        const evidence = validateEvidenceReferences(finalReview, task.evidenceIds);
        if (!evidence.valid) {
          return fail('needs_evidence', 'REVIEW_UNKNOWN_EVIDENCE_REFERENCE', {
            unknownEvidenceIds: evidence.unknownEvidenceIds,
          });
        }
        const reviewClaimSupport = validateClaimSupport(finalReview);
        if (!reviewClaimSupport.valid) {
          return fail('needs_evidence', 'REVIEW_UNSUPPORTED_CLAIMS', {
            unsupportedClaimIndexes: reviewClaimSupport.unsupportedClaimIndexes,
          });
        }
        if (finalReview.status !== 'completed') {
          return fail(finalReview.status, `REVIEW_${finalReview.status.toUpperCase()}`, { summary: finalReview.summary });
        }
        reviewActionDecisions = finalReview.proposedActions.map((action) => {
          const decision = evaluateToolRequest({ role: 'reviewer', tool: action.tool, task });
          return {
            tool: action.tool,
            policyAllowed: decision.allowed,
            reason: decision.allowed ? 'execution_disabled_in_workforce_pilot' : decision.reason,
          };
        });
        await store.appendEvent(taskId, {
          type: 'reviewer.completed',
          actor: 'reviewer',
          payload: { claims: finalReview.claims.length, proposedActions: reviewActionDecisions },
        });
      } catch (error) {
        return fail('failed', error.code || 'REVIEW_FAILED', { role: 'reviewer' });
      }
    }

    // The durable report is composed only from validated, evidence-linked claims.
    // Free-form model summaries remain drafts and are never promoted to verified findings.
    const verifiedClaims = finalReview
      ? finalReview.claims
      : results.flatMap(({ result: agentResult }) => agentResult.claims);
    const verifiedEvidenceIds = [...new Set(verifiedClaims.flatMap((claim) => claim.evidenceIds))];
    const contradictionReview = assessContradictionCandidates(verifiedClaims, { maxPairs: 100 });
    const evidenceSupportReview = assessEvidenceSupport(verifiedClaims, evidenceBundle, { maxPairs: 100 });
    await store.appendEvent(taskId, {
      type: 'research.contradiction_candidates.generated',
      actor: 'orchestrator',
      payload: { candidateCount: contradictionReview.candidateCount, truncated: contradictionReview.truncated, verdictsProduced: 0 },
    });
    await store.appendEvent(taskId, {
      type: 'research.evidence_support_review.generated',
      actor: 'orchestrator',
      payload: { reviewCount: evidenceSupportReview.reviewCount, truncated: evidenceSupportReview.truncated, semanticVerdictsProduced: 0 },
    });
    let researchCoverage = null;
    let researchGapPlan = null;
    if (task.researchBrief) {
      try {
        researchCoverage = assessQuestionCoverage(task.researchBrief.questions, verifiedClaims);
      } catch {
        return fail('needs_evidence', 'INVALID_RESEARCH_QUESTION_REFERENCE');
      }
      researchGapPlan = buildResearchGapPlan({
        questions: task.researchBrief.questions,
        coverage: researchCoverage,
        evidenceSupportReview: {
          ...evidenceSupportReview,
          reviews: evidenceSupportReview.reviews.map((review) => ({
            ...review,
            claimId: `claim-${review.claimIndex + 1}`,
            claimText: verifiedClaims[review.claimIndex]?.text || '',
            questionIds: verifiedClaims[review.claimIndex]?.questionIds || [],
          })),
        },
        contradictionReview,
        evidenceBundle,
        maxQueries: 8,
      });
      if (!researchCoverage.complete) {
        return fail('needs_evidence', 'REQUIRED_RESEARCH_QUESTIONS_UNANSWERED', {
          researchCoverage,
          researchGapPlan,
        });
      }
      // Query planning is deterministic; it does not fetch the web or consume a provider quota.
    }
    const evidenceReferences = evidenceBundle
      .filter((item) => verifiedEvidenceIds.includes(item.evidenceId))
      .map(({ evidenceId, sourceType, sourceUrl, title, contentSha256, capturedAt }) => ({
        evidenceId, sourceType, sourceUrl, title, contentSha256, capturedAt,
      }));
    const sourceAssessment = assessEvidenceDiversity(evidenceBundle);
    const result = {
      status: 'completed',
      taskId,
      summary: `Completed with ${verifiedClaims.length} evidence-linked claim(s); model-generated summaries remain unverified drafts.`,
      verifiedClaims,
      evidenceReferences,
      sourceAssessment,
      researchCoverage,
      researchGapPlan,
      contradictionReview,
      evidenceSupportReview,
      agentDrafts: results.map(({ role, result: agentResult }) => ({ role, summary: agentResult.summary })),
      agentResults: [
        ...results.map(({ role, blockedActions, proposedActionDecisions }) => ({ role, blockedActions, proposedActionDecisions })),
        ...(finalReview ? [{
          role: 'reviewer',
          blockedActions: reviewActionDecisions.filter((action) => !action.policyAllowed),
          proposedActionDecisions: reviewActionDecisions,
        }] : []),
      ],
      review: finalReview,
      modelCalls: calls,
      sideEffectsExecuted: 0,
    };
    if (taskExpired()) return fail('failed', 'TASK_EXPIRED');
    const completed = await store.transitionTask(taskId, 'running', 'completed', {
      result,
      event: { type: 'task.completed', actor: 'orchestrator', payload: { modelCalls: calls } },
    });
    if (!completed) return { taskId, status: 'stale', code: 'TASK_STATE_CHANGED' };
    return result;
  }

  return { submit, run };
}

module.exports = { createOrchestrator, withTimeout };
