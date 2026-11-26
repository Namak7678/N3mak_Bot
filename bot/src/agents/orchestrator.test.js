'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createOrchestrator } = require('./orchestrator');

function makeTask(overrides = {}) {
  const now = Date.now();
  return {
    taskId: 'orchestrator-task-1',
    idempotencyKey: 'orchestrator-idem-1',
    requester: { userId: 'telegram:42' },
    objective: 'Prepare an internal operations summary using supplied context.',
    taskType: 'research',
    priority: 'normal',
    dataClassification: 'public',
    approvalPolicy: 'human_required',
    roles: ['researcher', 'reviewer'],
    allowedTools: ['web:search', 'evidence:attach', 'evidence:verify', 'audit:read'],
    budget: { maxTokens: 3000, timeoutMs: 1000, maxModelCalls: 3 },
    evidenceIds: ['evidence-1'],
    createdAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function fakeStore(initialStatus = 'queued') {
  const rows = new Map();
  const events = [];
  return {
    rows,
    events,
    async createTask(payload) {
      const existing = [...rows.values()].find((row) => row.payload.idempotencyKey === payload.idempotencyKey);
      if (existing) return { created: false, task: existing };
      const row = { task_id: payload.taskId, status: initialStatus, payload, result: null };
      rows.set(payload.taskId, row);
      return { created: true, task: row };
    },
    async getTask(id) { return rows.get(id) || null; },
    async getEvidence(id) {
      return id === 'evidence-1' ? {
        evidence_id: id, source_type: 'web', source_url: 'https://example.com/source',
        title: 'Source title', content_text: 'Captured source text', content_sha256: createHash('sha256').update('Captured source text').digest('hex'),
        classification: 'public', captured_at: new Date().toISOString(),
      } : null;
    },
    async transitionTask(id, from, to, options = {}) {
      const row = rows.get(id);
      if (!row || row.status !== from) return false;
      row.status = to;
      if (options.result) row.result = options.result;
      events.push(options.event || { type: 'status', actor: 'test' });
      return true;
    },
    async appendEvent(id, event) { events.push({ taskId: id, ...event }); },
  };
}

const answer = (summary = 'Evidence checked.') => ({
  status: 'completed',
  summary,
  claims: [{ text: 'A supported finding.', evidenceIds: ['evidence-1'] }],
  proposedActions: [{ tool: 'content:publish', arguments: { draftId: 'draft-1' } }],
});

test('submits tasks with idempotency and returns existing duplicate', async () => {
  const store = fakeStore();
  const orchestrator = createOrchestrator({ store, runAgent: async () => answer() });
  const task = makeTask();
  assert.equal((await orchestrator.submit(task)).created, true);
  assert.equal((await orchestrator.submit(task)).created, false);
});

test('runs assigned workers and independent reviewer, without executing proposed actions', async () => {
  const store = fakeStore();
  const calls = [];
  const orchestrator = createOrchestrator({
    store,
    runAgent: async (input) => { calls.push(input); return answer(input.reviewOnly ? 'Reviewed.' : 'Research done.'); },
  });
  await orchestrator.submit(makeTask());
  const result = await orchestrator.run('orchestrator-task-1');
  assert.equal(result.status, 'completed');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].role, 'researcher');
  assert.equal(calls[0].evidence[0].content, 'Captured source text');
  assert.equal(calls[1].role, 'reviewer');
  assert.equal(calls[1].reviewOnly, true);
  assert.equal(calls[1].evidence[0].evidenceId, 'evidence-1');
  assert.equal(result.sideEffectsExecuted, 0);
  assert.equal(result.agentResults[0].blockedActions[0].reason, 'tool_not_allowed_by_task');
  assert.equal(store.rows.get('orchestrator-task-1').status, 'completed');
});

test('stops the workflow when a worker cites evidence outside the task bundle', async () => {
  const store = fakeStore();
  const orchestrator = createOrchestrator({
    store,
    runAgent: async () => ({
      status: 'completed',
      summary: 'Unsupported source.',
      claims: [{ text: 'Unverified.', evidenceIds: ['invented-evidence'] }],
      proposedActions: [],
    }),
  });
  await orchestrator.submit(makeTask());
  const result = await orchestrator.run('orchestrator-task-1');
  assert.equal(result.status, 'needs_evidence');
  assert.equal(result.code, 'UNKNOWN_EVIDENCE_REFERENCE');
  assert.equal(store.rows.get('orchestrator-task-1').status, 'needs_evidence');
});

test('does not execute tasks after their expiry', async () => {
  const store = fakeStore();
  let called = false;
  const orchestrator = createOrchestrator({
    store,
    clock: () => new Date(Date.now() + 2 * 60 * 60 * 1000),
    runAgent: async () => { called = true; return answer(); },
  });
  await orchestrator.submit(makeTask());
  const result = await orchestrator.run('orchestrator-task-1');
  assert.equal(result.error, 'TASK_EXPIRED');
  assert.equal(called, false);
});

test('rejects concurrent duplicate claims and unknown task ids', async () => {
  const store = fakeStore('running');
  const orchestrator = createOrchestrator({ store, runAgent: async () => answer() });
  await orchestrator.submit(makeTask());
  assert.equal((await orchestrator.run('orchestrator-task-1')).busy, true);
  assert.equal((await orchestrator.run('missing-task')).status, 'not_found');
});

test('fails closed when the agent returns malformed output', async () => {
  const store = fakeStore();
  const orchestrator = createOrchestrator({ store, runAgent: async () => ({ status: 'completed', summary: 'bad' }) });
  await orchestrator.submit(makeTask());
  const result = await orchestrator.run('orchestrator-task-1');
  assert.equal(result.status, 'failed');
  assert.equal(store.rows.get('orchestrator-task-1').status, 'failed');
});


test('stops before model calls when a task references a missing stored evidence record', async () => {
  const store = fakeStore();
  let called = false;
  const orchestrator = createOrchestrator({
    store,
    runAgent: async () => { called = true; return answer(); },
  });
  await orchestrator.submit(makeTask({ evidenceIds: ['missing-evidence'] }));
  const result = await orchestrator.run('orchestrator-task-1');
  assert.equal(result.status, 'needs_evidence');
  assert.equal(result.code, 'EVIDENCE_RECORD_NOT_FOUND');
  assert.equal(called, false);
});

test('refuses evidence whose classification exceeds the task classification', async () => {
  const store = fakeStore();
  store.getEvidence = async () => ({
    evidence_id: 'evidence-1', source_type: 'document', source_url: null,
    title: 'Restricted', content_text: 'Secret data', content_sha256: createHash('sha256').update('Secret data').digest('hex'),
    classification: 'restricted', captured_at: new Date().toISOString(),
  });
  let called = false;
  const orchestrator = createOrchestrator({
    store,
    runAgent: async () => { called = true; return answer(); },
  });
  await orchestrator.submit(makeTask({ dataClassification: 'public' }));
  const result = await orchestrator.run('orchestrator-task-1');
  assert.equal(result.status, 'refused');
  assert.equal(result.code, 'EVIDENCE_CLASSIFICATION_MISMATCH');
  assert.equal(called, false);
});


test('does not report completion when recovery changed the task state concurrently', async () => {
  const store = fakeStore();
  const transition = store.transitionTask;
  store.transitionTask = async (id, from, to, options) => {
    if (to === 'completed') {
      store.rows.get(id).status = 'failed';
      return false;
    }
    return transition(id, from, to, options);
  };
  const orchestrator = createOrchestrator({ store, runAgent: async () => answer() });
  await orchestrator.submit(makeTask());
  const result = await orchestrator.run('orchestrator-task-1');
  assert.equal(result.status, 'stale');
  assert.equal(result.code, 'TASK_STATE_CHANGED');
  assert.equal(store.rows.get('orchestrator-task-1').status, 'failed');
});


test('blocks a stored evidence record when its content digest does not match', async () => {
  const store = fakeStore();
  store.getEvidence = async () => ({
    evidence_id: 'evidence-1', source_type: 'web', source_url: 'https://example.com',
    title: 'Tampered', content_text: 'Altered source text', content_sha256: '0'.repeat(64),
    classification: 'public', captured_at: new Date().toISOString(),
  });
  let called = false;
  const orchestrator = createOrchestrator({
    store,
    runAgent: async () => { called = true; return answer(); },
  });
  await orchestrator.submit(makeTask());
  const result = await orchestrator.run('orchestrator-task-1');
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'EVIDENCE_INTEGRITY_CHECK_FAILED');
  assert.equal(called, false);
});


test('blocks a worker factual claim that has no supporting evidence ID', async () => {
  const store = fakeStore();
  const orchestrator = createOrchestrator({
    store,
    runAgent: async () => ({
      status: 'completed',
      summary: 'A claim without a source.',
      claims: [{ text: 'Unsupported factual claim.', evidenceIds: [] }],
      proposedActions: [],
    }),
  });
  await orchestrator.submit(makeTask());
  const result = await orchestrator.run('orchestrator-task-1');
  assert.equal(result.status, 'needs_evidence');
  assert.equal(result.code, 'UNSUPPORTED_CLAIMS');
  assert.deepEqual(result.unsupportedClaimIndexes, [0]);
});
