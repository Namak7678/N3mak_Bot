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
        if (normalized.startsWith('INSERT INTO n3mak_agent_evidence')) {
          return { rowCount: 1, rows: [{
            evidence_id: params[0], source_type: params[1], source_url: params[2],
            title: params[3], content_sha256: params[5], classification: params[6],
            metadata: JSON.parse(params[7]), captured_at: params[8],
          }] };
        }
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


test('rejects illegal task status transitions before opening a database transaction', async () => {
  const { db, calls } = fakeDatabase();
  const store = createAgentTaskStore({ db });

  await assert.rejects(
    store.transitionTask('task-store-1', 'completed', 'running'),
    /invalid_task_status_transition/,
  );
  assert.equal(calls.length, 0);
});

test('expires overdue queued and running tasks atomically and appends recovery audit events', async () => {
  const { db, calls } = fakeDatabase();
  const store = createAgentTaskStore({ db });

  await store.expireOverdueTasks();

  const sql = calls[0].sql;
  assert.match(sql, /UPDATE n3mak_agent_tasks/);
  assert.match(sql, /status IN \('queued', 'running'\)/);
  assert.match(sql, /expires_at <= NOW\(\)/);
  assert.match(sql, /INSERT INTO n3mak_agent_task_events/);
  assert.match(sql, /task.expired_recovered/);
});

test('reads task audit history newest first with a bounded limit', async () => {
  const { db, calls } = fakeDatabase();
  const store = createAgentTaskStore({ db });

  await store.getTaskEvents('task-store-1', { limit: 500 });

  assert.match(calls[0].sql, /ORDER BY event_id DESC LIMIT \$2/);
  assert.deepEqual(calls[0].params, ['task-store-1', 100]);
});


test('stores evidence with normalized provenance and a content digest', async () => {
  const { db, calls } = fakeDatabase();
  const store = createAgentTaskStore({ db });

  const saved = await store.saveEvidence({
    evidenceId: 'evidence-store-1',
    sourceType: 'web',
    sourceUrl: 'https://example.com/report?utm_source=chat',
    title: 'Public report',
    content: 'Captured source excerpt',
  });

  assert.equal(saved.evidence_id, 'evidence-store-1');
  assert.equal(saved.source_url, 'https://example.com/report');
  assert.equal(saved.content_sha256.length, 64);
  assert.match(calls[0].sql, /^INSERT INTO n3mak_agent_evidence/);
});

test('evidence schema enforces immutable records through a database trigger', async () => {
  const { db, calls } = fakeDatabase();
  const store = createAgentTaskStore({ db });

  await store.ensureSchema();

  assert.match(calls[0].sql, /CREATE TABLE IF NOT EXISTS n3mak_agent_evidence/);
  assert.match(calls[0].sql, /BEFORE UPDATE OR DELETE ON n3mak_agent_evidence/);
  assert.match(calls[0].sql, /n3mak agent evidence is immutable/);
});
