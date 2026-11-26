'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
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
  assert.equal(calls[1].role, 'reviewer');
  assert.equal(calls[1].reviewOnly, true);
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
