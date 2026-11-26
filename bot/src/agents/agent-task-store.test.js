'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentTaskStore } = require('./agent-task-store');

function fakeDatabase({ insertRowCount = 1, updateRowCount = 1 } = {}) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      if (normalized.startsWith('INSERT INTO n3mak_agent_tasks')) {
        return insertRowCount
          ? { rowCount: 1, rows: [{ task_id: params[0], status: 'queued', payload: JSON.parse(params[2]), result: null }] }
          : { rowCount: 0, rows: [] };
      }
      if (normalized.startsWith('SELECT task_id, status, payload, result, created_at FROM n3mak_agent_tasks')) {
        return { rowCount: 1, rows: [{ task_id: 'existing-task', status: 'queued', payload: {}, result: null }] };
      }
      if (normalized.startsWith('UPDATE n3mak_agent_tasks')) {
        return { rowCount: updateRowCount, rows: updateRowCount ? [{ task_id: params[0] }] : [] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() { calls.push({ sql: 'RELEASE', params: [] }); },
  };
  return {
    calls,
    db: {
      async connect() { return client; },
      async query(sql, params = []) {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        calls.push({ sql: normalized, params });
        return { rowCount: 1, rows: [] };
      },
    },
  };
}

function taskPayload() {
  return {
    taskId: 'task-store-1',
    idempotencyKey: 'idem-store-1',
    requester: { userId: 'telegram:7' },
    taskType: 'research',
    priority: 'normal',
    expiresAt: '2026-11-27T00:00:00.000Z',
  };
}

test('creates a task and its audit event in one transaction', async () => {
  const { db, calls } = fakeDatabase();
  const store = createAgentTaskStore({ db });

  const result = await store.createTask(taskPayload());

  assert.equal(result.created, true);
  assert.deepEqual(calls.map((call) => call.sql), [
    'BEGIN',
    calls[1].sql,
    calls[2].sql,
    'COMMIT',
    'RELEASE',
  ]);
  assert.match(calls[1].sql, /^INSERT INTO n3mak_agent_tasks/);
  assert.match(calls[2].sql, /^INSERT INTO n3mak_agent_task_events/);
});

test('returns the existing task on an idempotency conflict without appending another queued event', async () => {
  const { db, calls } = fakeDatabase({ insertRowCount: 0 });
  const store = createAgentTaskStore({ db });

  const result = await store.createTask(taskPayload());

  assert.equal(result.created, false);
  assert.equal(result.task.task_id, 'existing-task');
  assert.equal(calls.some((call) => call.sql.startsWith('INSERT INTO n3mak_agent_task_events')), false);
  assert.equal(calls.at(-2).sql, 'COMMIT');
});

test('rolls back a failed compare-and-set transition and writes no audit event', async () => {
  const { db, calls } = fakeDatabase({ updateRowCount: 0 });
  const store = createAgentTaskStore({ db });

  const changed = await store.transitionTask('task-store-1', 'queued', 'running');

  assert.equal(changed, false);
  assert.equal(calls.some((call) => call.sql.startsWith('INSERT INTO n3mak_agent_task_events')), false);
  assert.equal(calls.at(-2).sql, 'ROLLBACK');
  assert.equal(calls.at(-1).sql, 'RELEASE');
});
