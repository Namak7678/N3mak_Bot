'use strict';

const { pool } = require('../db');
const { createEvidenceRecord } = require('./evidence-contract');

function createAgentTaskStore({ db = pool } = {}) {
  if (!db || typeof db.query !== 'function' || typeof db.connect !== 'function') {
    throw new TypeError('invalid_agent_task_database');
  }

  let schemaPromise;

  async function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = db.query(`
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
      CREATE TABLE IF NOT EXISTS n3mak_agent_evidence (
        evidence_id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL CHECK (source_type IN ('web','document','user_note','api')),
        source_url TEXT,
        title TEXT NOT NULL,
        content_text TEXT NOT NULL,
        content_sha256 CHAR(64) NOT NULL,
        classification TEXT NOT NULL CHECK (classification IN ('public','internal','confidential','restricted')),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        captured_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS n3mak_agent_evidence_captured_idx
        ON n3mak_agent_evidence (captured_at DESC);
      CREATE INDEX IF NOT EXISTS n3mak_agent_evidence_source_idx
        ON n3mak_agent_evidence (source_type, captured_at DESC);
      CREATE OR REPLACE FUNCTION n3mak_reject_evidence_mutation()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'n3mak agent evidence is immutable; add a new version';
      END;
      $$;
      DROP TRIGGER IF EXISTS n3mak_agent_evidence_no_update ON n3mak_agent_evidence;
      CREATE TRIGGER n3mak_agent_evidence_no_update
        BEFORE UPDATE OR DELETE ON n3mak_agent_evidence
        FOR EACH ROW EXECUTE FUNCTION n3mak_reject_evidence_mutation();
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
    `).catch((error) => {
      schemaPromise = null;
      throw error;
    });
    }
    return schemaPromise;
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

  async function saveEvidence(input) {
    const record = createEvidenceRecord(input);
    const result = await db.query(
      `INSERT INTO n3mak_agent_evidence
        (evidence_id, source_type, source_url, title, content_text, content_sha256, classification, metadata, captured_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       RETURNING evidence_id, source_type, source_url, title, content_sha256, classification, metadata, captured_at`,
      [record.evidenceId, record.sourceType, record.sourceUrl, record.title, record.content,
        record.contentSha256, record.classification, JSON.stringify(record.metadata), record.capturedAt],
    );
    return result.rows[0];
  }

  async function getEvidence(evidenceId) {
    const result = await db.query(
      `SELECT evidence_id, source_type, source_url, title, content_text, content_sha256,
              classification, metadata, captured_at
       FROM n3mak_agent_evidence WHERE evidence_id = $1`,
      [evidenceId],
    );
    return result.rows[0] || null;
  }

  async function listRecentEvidence({ limit = 20, sourceType } = {}) {
    const safeLimit = Math.max(1, Math.min(100, Number.isInteger(limit) ? limit : 20));
    const result = await db.query(
      `SELECT evidence_id, source_type, source_url, title, content_sha256, classification, captured_at
       FROM n3mak_agent_evidence
       WHERE ($1::text IS NULL OR source_type = $1)
       ORDER BY captured_at DESC LIMIT $2`,
      [sourceType || null, safeLimit],
    );
    return result.rows;
  }

  async function getTask(taskId) {
    const result = await db.query(
      'SELECT task_id, status, payload, result, error, created_at, updated_at FROM n3mak_agent_tasks WHERE task_id = $1',
      [taskId],
    );
    return result.rows[0] || null;
  }

  async function transitionTask(taskId, expectedStatus, nextStatus, { result, error, event } = {}) {
    const transitions = {
      queued: ['running', 'failed'],
      running: ['completed', 'needs_evidence', 'refused', 'failed'],
    };
    if (!transitions[expectedStatus]?.includes(nextStatus)) {
      throw new TypeError('invalid_task_status_transition');
    }
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

  async function getTaskEvents(taskId, { limit = 20 } = {}) {
    const safeLimit = Math.max(1, Math.min(100, Number.isInteger(limit) ? limit : 20));
    const result = await db.query(
      `SELECT event_id, event_type, actor, payload, created_at
       FROM n3mak_agent_task_events
       WHERE task_id = $1
       ORDER BY event_id DESC LIMIT $2`,
      [taskId, safeLimit],
    );
    return result.rows;
  }

  // Expired work is terminally failed, never silently re-queued. The pilot has
  // no external side effects, and this avoids replaying a worker still alive
  // after a process/network timeout.
  async function expireOverdueTasks() {
    const result = await db.query(`
      WITH expired AS (
        UPDATE n3mak_agent_tasks
        SET status = 'failed',
            error = jsonb_build_object('code', 'TASK_EXPIRED_RECOVERED'),
            updated_at = NOW()
        WHERE status IN ('queued', 'running') AND expires_at <= NOW()
        RETURNING task_id, status, updated_at
      ), logged AS (
        INSERT INTO n3mak_agent_task_events (task_id, event_type, actor, payload)
        SELECT task_id, 'task.expired_recovered', 'recovery',
               jsonb_build_object('code', 'TASK_EXPIRED_RECOVERED')
        FROM expired
        RETURNING task_id
      )
      SELECT expired.task_id, expired.status, expired.updated_at
      FROM expired
      JOIN logged USING (task_id)
      ORDER BY expired.updated_at DESC
    `);
    return result.rows;
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

  async function getTaskStatusCounts() {
    const result = await db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM n3mak_agent_tasks
       GROUP BY status
       ORDER BY status`,
    );
    return result.rows;
  }

  return { ensureSchema, createTask, getTask, getTaskEvents, transitionTask, appendEvent, expireOverdueTasks, listRecentTasks, getTaskStatusCounts, saveEvidence, getEvidence, listRecentEvidence };
}

const defaultStore = createAgentTaskStore();

module.exports = { ...defaultStore, createAgentTaskStore };
