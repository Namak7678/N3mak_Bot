'use strict';

const { pool } = require('../db');

function createAgentTaskStore({ db = pool } = {}) {
  if (!db || typeof db.query !== 'function' || typeof db.connect !== 'function') {
    throw new TypeError('invalid_agent_task_database');
  }

  async function ensureSchema() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS n3mak_agent_tasks (
        task_id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('queued','running','completed','needs_evidence','refused','failed')),
        payload JSONB NOT NULL,
        result JSONB,
        error JSONB,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS n3mak_agent_tasks_status_created_idx
        ON n3mak_agent_tasks (status, created_at);
      CREATE INDEX IF NOT EXISTS n3mak_agent_tasks_expiry_idx
        ON n3mak_agent_tasks (expires_at);
      CREATE TABLE IF NOT EXISTS n3mak_agent_task_events (
        event_id BIGSERIAL PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES n3mak_agent_tasks(task_id) ON DELETE RESTRICT,
        event_type TEXT NOT NULL,
        actor TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS n3mak_agent_task_events_task_idx
        ON n3mak_agent_task_events (task_id, event_id);
      CREATE OR REPLACE FUNCTION n3mak_reject_agent_event_mutation()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'n3mak agent audit events are append-only';
      END;
      $$;
      DROP TRIGGER IF EXISTS n3mak_agent_events_no_update ON n3mak_agent_task_events;
      CREATE TRIGGER n3mak_agent_events_no_update
        BEFORE UPDATE OR DELETE ON n3mak_agent_task_events
        FOR EACH ROW EXECUTE FUNCTION n3mak_reject_agent_event_mutation();
    `);
  }

  async function appendEventWith(client, taskId, event) {
    await client.query(
      'INSERT INTO n3mak_agent_task_events (task_id, event_type, actor, payload) VALUES ($1,$2,$3,$4::jsonb)',
      [taskId, event.type, event.actor || 'system', JSON.stringify(event.payload || {})],
    );
  }

  async function createTask(payload) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO n3mak_agent_tasks (task_id, idempotency_key, status, payload, expires_at)
         VALUES ($1,$2,'queued',$3::jsonb,$4)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING task_id, status, payload, result, created_at`,
        [payload.taskId, payload.idempotencyKey, JSON.stringify(payload), payload.expiresAt],
      );
      if (!inserted.rowCount) {
        const existing = await client.query(
          'SELECT task_id, status, payload, result, created_at FROM n3mak_agent_tasks WHERE idempotency_key = $1',
          [payload.idempotencyKey],
        );
        await client.query('COMMIT');
        return { created: false, task: existing.rows[0] || null };
      }
      await appendEventWith(client, payload.taskId, {
        type: 'task.queued',
        actor: String(payload.requester.userId),
        payload: { taskType: payload.taskType, priority: payload.priority },
      });
      await client.query('COMMIT');
      return { created: true, task: inserted.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function getTask(taskId) {
    const result = await db.query(
      'SELECT task_id, status, payload, result, error, created_at, updated_at FROM n3mak_agent_tasks WHERE task_id = $1',
      [taskId],
    );
    return result.rows[0] || null;
  }

  async function transitionTask(taskId, expectedStatus, nextStatus, { result, error, event } = {}) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE n3mak_agent_tasks
         SET status = $3,
             result = COALESCE($4::jsonb, result),
             error = COALESCE($5::jsonb, error),
             updated_at = NOW()
         WHERE task_id = $1 AND status = $2
         RETURNING task_id`,
        [taskId, expectedStatus, nextStatus,
          result === undefined ? null : JSON.stringify(result),
          error === undefined ? null : JSON.stringify(error)],
      );
      if (updated.rowCount !== 1) {
        await client.query('ROLLBACK');
        return false;
      }
      if (event) await appendEventWith(client, taskId, event);
      else await appendEventWith(client, taskId, {
        type: 'task.status_changed',
        actor: 'orchestrator',
        payload: { from: expectedStatus, to: nextStatus },
      });
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function appendEvent(taskId, event) {
    await db.query(
      'INSERT INTO n3mak_agent_task_events (task_id, event_type, actor, payload) VALUES ($1,$2,$3,$4::jsonb)',
      [taskId, event.type, event.actor || 'system', JSON.stringify(event.payload || {})],
    );
  }

  async function listRecentTasks({ limit = 20, status } = {}) {
    const safeLimit = Math.max(1, Math.min(100, Number.isInteger(limit) ? limit : 20));
    const result = await db.query(
      `SELECT task_id, status, payload->>'taskType' AS task_type, payload->>'priority' AS priority,
              created_at, updated_at, expires_at
       FROM n3mak_agent_tasks
       WHERE ($1::text IS NULL OR status = $1)
       ORDER BY created_at DESC LIMIT $2`,
      [status || null, safeLimit],
    );
    return result.rows;
  }

  return { ensureSchema, createTask, getTask, transitionTask, appendEvent, listRecentTasks };
}

const defaultStore = createAgentTaskStore();

module.exports = { ...defaultStore, createAgentTaskStore };
