'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTaskEnvelope, validateAgentResult, validateEvidenceReferences, validateClaimSupport } = require('./task-contract');
const { evaluateToolRequest } = require('./policy-gate');

function task(overrides = {}) {
  return {
    taskId: 'task-001',
    idempotencyKey: 'idem-001',
    requester: { userId: 'telegram:123' },
    objective: 'Research a public company profile using only supplied evidence.',
    taskType: 'research',
    priority: 'normal',
    dataClassification: 'public',
    approvalPolicy: 'human_required',
    roles: ['researcher', 'reviewer'],
    allowedTools: ['web:search', 'evidence:attach', 'evidence:verify'],
    budget: { maxTokens: 4000, timeoutMs: 30000, maxModelCalls: 4 },
    evidenceIds: ['source-1', 'source-2'],
    createdAt: '2026-11-26T10:00:00.000Z',
    expiresAt: '2026-11-26T11:00:00.000Z',
    ...overrides,
  };
}

test('accepts a bounded, well-formed task envelope', () => {
  assert.equal(validateTaskEnvelope(task()).taskId, 'task-001');
});

test('rejects unknown agent roles and excessive model budgets', () => {
  assert.throws(() => validateTaskEnvelope(task({ roles: ['unlisted-agent'] })), /unknown_or_duplicate_role/);
  assert.throws(() => validateTaskEnvelope(task({ budget: { maxTokens: 100001, timeoutMs: 30000, maxModelCalls: 4 } })), /task_budget_exceeds_hard_limit/);
});

test('rejects unknown fields in task and model outputs', () => {
  assert.throws(() => validateTaskEnvelope(task({ hiddenOverride: true })), /unexpected_task_fields/);
  assert.throws(() => validateAgentResult({ status: 'completed', summary: 'ok', claims: [], proposedActions: [], executeNow: true }), /unexpected_result_fields/);
});

test('rejects duplicate or malformed allowed tools', () => {
  assert.throws(() => validateTaskEnvelope(task({ allowedTools: ['web:search', 'web:search'] })), /duplicate_allowed_tool/);
});

test('accepts a structured agent result and rejects malformed claims', () => {
  const result = {
    status: 'completed',
    summary: 'Found two relevant sources.',
    claims: [{ text: 'Source one supports the claim.', evidenceIds: ['source-1'] }],
    proposedActions: [],
  };
  assert.equal(validateAgentResult(result), result);
  assert.throws(() => validateAgentResult({ ...result, claims: [{ text: 'Unsupported shape' }] }), /invalid_claim_evidence/);
});

test('flags evidence references that were not supplied to the agent', () => {
  const result = {
    status: 'completed',
    summary: 'A claim with a fabricated reference.',
    claims: [{ text: 'Claim.', evidenceIds: ['not-in-brief'] }],
    proposedActions: [],
  };
  assert.deepEqual(validateEvidenceReferences(result, ['source-1']), {
    valid: false,
    unknownEvidenceIds: ['not-in-brief'],
  });
});

test('allows only tools present in both the role capability list and task allow-list', () => {
  const t = task();
  assert.equal(evaluateToolRequest({ role: 'researcher', tool: 'web:search', task: t }).allowed, true);
  assert.equal(evaluateToolRequest({ role: 'researcher', tool: 'payment:refund', task: { ...t, allowedTools: ['payment:refund'] } }).reason, 'tool_not_allowed_for_role');
});

test('denies external side effects by default, even when requested in task allow-list', () => {
  const t = task({ roles: ['orchestrator'], allowedTools: ['message:send'] });
  assert.deepEqual(evaluateToolRequest({ role: 'orchestrator', tool: 'message:send', task: t }), {
    allowed: false,
    reason: 'tool_not_allowed_for_role',
  });
});

test('requires a scoped, unexpired human approval for any future-enabled sensitive tool', () => {
  const t = task({ roles: ['orchestrator'], allowedTools: ['message:send'] });
  const result = evaluateToolRequest({
    role: 'orchestrator',
    tool: 'message:send',
    task: t,
    approval: {
      status: 'approved',
      taskId: t.taskId,
      tool: 'message:send',
      approvedBy: 'owner:1',
      approvedAt: '2026-11-26T10:01:00.000Z',
      expiresAt: '2026-11-26T10:10:00.000Z',
    },
    now: new Date('2026-11-26T10:02:00.000Z'),
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'tool_not_allowed_for_role');
});


test('rejects factual claims without any evidence references', () => {
  const result = {
    status: 'completed',
    summary: 'A report with an unsupported statement.',
    claims: [
      { text: 'Supported statement.', evidenceIds: ['source-1'] },
      { text: 'Unsupported statement.', evidenceIds: [] },
    ],
    proposedActions: [],
  };
  assert.deepEqual(validateClaimSupport(result), {
    valid: false,
    unsupportedClaimIndexes: [1],
  });
});

test('accepts empty claims for drafting-only outputs', () => {
  assert.deepEqual(validateClaimSupport({
    status: 'completed',
    summary: 'Draft structure prepared.',
    claims: [],
    proposedActions: [],
  }), { valid: true, unsupportedClaimIndexes: [] });
});
