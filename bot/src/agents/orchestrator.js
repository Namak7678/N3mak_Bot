'use strict';

const { validateTaskEnvelope, validateAgentResult, validateEvidenceReferences } = require('./task-contract');
const { getRoleCapabilities } = require('./registry');
const { evaluateToolRequest } = require('./policy-gate');

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
    const maxTokensPerCall = Math.max(1, Math.floor(task.budget.maxTokens / task.budget.maxModelCalls));
    const roles = task.roles.filter((role) => role !== 'reviewer');
    const reviewerAssigned = task.roles.includes('reviewer');

    async function fail(status, code, details = {}) {
      const result = { status, code, ...details };
      await store.transitionTask(taskId, 'running', status, {
        result,
        error: { code },
        event: { type: `task.${status}`, actor: 'orchestrator', payload: { code } },
      });
      return { taskId, ...result };
    }

    const evidenceBundle = [];
    if (task.evidenceIds.length && typeof store.getEvidence !== 'function') {
      return fail('needs_evidence', 'EVIDENCE_STORE_UNAVAILABLE');
    }
    const classificationRank = { public: 0, internal: 1, confidential: 2, restricted: 3 };
    for (const evidenceId of task.evidenceIds) {
      const evidence = await store.getEvidence(evidenceId);
      if (!evidence) return fail('needs_evidence', 'EVIDENCE_RECORD_NOT_FOUND', { missingEvidenceIds: [evidenceId] });
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

    for (const role of roles) {
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
        const result = validateAgentResult(raw);
        const evidence = validateEvidenceReferences(result, task.evidenceIds);
        if (!evidence.valid) {
          return fail('needs_evidence', 'UNKNOWN_EVIDENCE_REFERENCE', {
            role,
            unknownEvidenceIds: evidence.unknownEvidenceIds,
          });
        }
        if (result.status !== 'completed') {
          return fail(result.status, `AGENT_${result.status.toUpperCase()}`, { role, summary: result.summary });
        }

        const blockedActions = [];
        for (const action of result.proposedActions) {
          const decision = evaluateToolRequest({ role, tool: action.tool, task });
          if (!decision.allowed) blockedActions.push({ tool: action.tool, reason: decision.reason });
        }
        results.push({ role, result, blockedActions });
        await store.appendEvent(taskId, {
          type: 'agent.completed',
          actor: role,
          payload: { claims: result.claims.length, proposedActions: result.proposedActions.length, blockedActions },
        });
      } catch (error) {
        return fail('failed', error.code || 'AGENT_EXECUTION_FAILED', { role });
      }
    }

    let finalReview = null;
    if (reviewerAssigned) {
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
        finalReview = validateAgentResult(raw);
        const evidence = validateEvidenceReferences(finalReview, task.evidenceIds);
        if (!evidence.valid) {
          return fail('needs_evidence', 'REVIEW_UNKNOWN_EVIDENCE_REFERENCE', {
            unknownEvidenceIds: evidence.unknownEvidenceIds,
          });
        }
        if (finalReview.status !== 'completed') {
          return fail(finalReview.status, `REVIEW_${finalReview.status.toUpperCase()}`, { summary: finalReview.summary });
        }
      } catch (error) {
        return fail('failed', error.code || 'REVIEW_FAILED', { role: 'reviewer' });
      }
    }

    const result = {
      status: 'completed',
      taskId,
      agentResults: results,
      review: finalReview,
      modelCalls: calls,
      sideEffectsExecuted: 0,
    };
    await store.transitionTask(taskId, 'running', 'completed', {
      result,
      event: { type: 'task.completed', actor: 'orchestrator', payload: { modelCalls: calls } },
    });
    return result;
  }

  return { submit, run };
}

module.exports = { createOrchestrator, withTimeout };
