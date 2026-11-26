'use strict';

const { KNOWN_ROLES } = require('./registry');

const TASK_TYPES = Object.freeze([
  'research', 'analysis', 'development', 'marketing', 'support', 'operations', 'reporting',
]);
const PRIORITIES = Object.freeze(['low', 'normal', 'high']);
const DATA_CLASSIFICATIONS = Object.freeze(['public', 'internal', 'confidential', 'restricted']);
const APPROVAL_POLICIES = Object.freeze(['none', 'human_required']);
const RESULT_STATUSES = Object.freeze(['completed', 'needs_evidence', 'refused', 'failed']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value, allowed, field) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new TypeError(`unexpected_${field}_fields:${unexpected.join(',')}`);
}

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d\d-\d\dT/.test(value);
}

function assertString(value, field, max = 256) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new TypeError(`invalid_${field}`);
  }
}

function validateTaskEnvelope(task) {
  if (!isPlainObject(task)) throw new TypeError('task_must_be_object');
  assertExactKeys(task, ['taskId', 'idempotencyKey', 'requester', 'objective', 'taskType', 'priority', 'dataClassification', 'approvalPolicy', 'roles', 'allowedTools', 'budget', 'evidenceIds', 'createdAt', 'expiresAt'], 'task');
  assertString(task.taskId, 'task_id', 100);
  assertString(task.idempotencyKey, 'idempotency_key', 128);
  assertString(task.objective, 'objective', 4000);
  if (!isPlainObject(task.requester)) throw new TypeError('invalid_requester');
  assertExactKeys(task.requester, ['userId'], 'requester');
  assertString(String(task.requester.userId || ''), 'requester_user_id', 128);
  if (!TASK_TYPES.includes(task.taskType)) throw new TypeError('invalid_task_type');
  if (!PRIORITIES.includes(task.priority)) throw new TypeError('invalid_priority');
  if (!DATA_CLASSIFICATIONS.includes(task.dataClassification)) throw new TypeError('invalid_data_classification');
  if (!APPROVAL_POLICIES.includes(task.approvalPolicy)) throw new TypeError('invalid_approval_policy');
  if (!Array.isArray(task.roles) || task.roles.length < 1 || task.roles.length > 4) {
    throw new TypeError('invalid_roles');
  }
  if (new Set(task.roles).size !== task.roles.length || task.roles.some((role) => !KNOWN_ROLES.includes(role))) {
    throw new TypeError('unknown_or_duplicate_role');
  }
  if (!Array.isArray(task.allowedTools) || task.allowedTools.length > 20 ||
      task.allowedTools.some((tool) => typeof tool !== 'string' || !tool.trim())) {
    throw new TypeError('invalid_allowed_tools');
  }
  if (new Set(task.allowedTools).size !== task.allowedTools.length) {
    throw new TypeError('duplicate_allowed_tool');
  }
  if (!isPlainObject(task.budget)) throw new TypeError('invalid_budget');
  assertExactKeys(task.budget, ['maxTokens', 'timeoutMs', 'maxModelCalls'], 'budget');
  for (const field of ['maxTokens', 'timeoutMs', 'maxModelCalls']) {
    if (!Number.isSafeInteger(task.budget[field]) || task.budget[field] < 1) {
      throw new TypeError(`invalid_budget_${field}`);
    }
  }
  if (task.budget.maxTokens > 100000 || task.budget.timeoutMs > 300000 ||
      task.budget.maxModelCalls > 20) {
    throw new RangeError('task_budget_exceeds_hard_limit');
  }
  if (!Array.isArray(task.evidenceIds) || task.evidenceIds.length > 10 ||
      task.evidenceIds.some((id) => typeof id !== 'string' || !id.trim() || id.length > 160)) {
    throw new TypeError('invalid_evidence_ids_max_10');
  }
  if (!isIsoDate(task.createdAt) || !isIsoDate(task.expiresAt) ||
      Date.parse(task.expiresAt) <= Date.parse(task.createdAt)) {
    throw new TypeError('invalid_task_dates');
  }
  return task;
}

function validateAgentResult(result) {
  if (!isPlainObject(result)) throw new TypeError('result_must_be_object');
  assertExactKeys(result, ['status', 'summary', 'claims', 'proposedActions'], 'result');
  if (!RESULT_STATUSES.includes(result.status)) throw new TypeError('invalid_result_status');
  assertString(result.summary, 'result_summary', 6000);
  if (!Array.isArray(result.claims) || result.claims.length > 100) throw new TypeError('invalid_claims');
  for (const claim of result.claims) {
    if (!isPlainObject(claim)) throw new TypeError('invalid_claim');
    assertExactKeys(claim, ['text', 'evidenceIds'], 'claim');
    assertString(claim.text, 'claim_text', 1200);
    if (!Array.isArray(claim.evidenceIds) ||
        claim.evidenceIds.some((id) => typeof id !== 'string' || !id.trim())) {
      throw new TypeError('invalid_claim_evidence');
    }
  }
  if (!Array.isArray(result.proposedActions) || result.proposedActions.length > 20) {
    throw new TypeError('invalid_proposed_actions');
  }
  for (const action of result.proposedActions) {
    if (!isPlainObject(action)) throw new TypeError('invalid_proposed_action');
    assertExactKeys(action, ['tool', 'arguments'], 'proposed_action');
    if (typeof action.tool !== 'string' || !action.tool.trim() ||
        !isPlainObject(action.arguments || {})) {
      throw new TypeError('invalid_proposed_action');
    }
  }
  return result;
}

function validateEvidenceReferences(result, allowedEvidenceIds) {
  validateAgentResult(result);
  const allowed = new Set(allowedEvidenceIds);
  const unknown = [];
  for (const claim of result.claims) {
    for (const id of claim.evidenceIds) if (!allowed.has(id)) unknown.push(id);
  }
  return { valid: unknown.length === 0, unknownEvidenceIds: [...new Set(unknown)] };
}

module.exports = {
  TASK_TYPES,
  PRIORITIES,
  DATA_CLASSIFICATIONS,
  APPROVAL_POLICIES,
  RESULT_STATUSES,
  validateTaskEnvelope,
  validateAgentResult,
  validateEvidenceReferences,
};
