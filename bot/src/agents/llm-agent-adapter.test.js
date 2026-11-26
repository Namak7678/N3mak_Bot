'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAgentJson, routeForTask, createN3makAgentAdapter } = require('./llm-agent-adapter');

test('accepts a strict JSON object from the model adapter', () => {
  assert.deepEqual(parseAgentJson('{"status":"completed","summary":"Draft ready","claims":[],"proposedActions":[]}'), {
    status: 'completed',
    summary: 'Draft ready',
    claims: [],
    proposedActions: [],
  });
});

test('rejects markdown fences, malformed JSON and arrays', () => {
  assert.throws(() => parseAgentJson('```json\n{}\n```'));
  assert.throws(() => parseAgentJson('{broken'));
  assert.throws(() => parseAgentJson('[]'), /must_be_json_object/);
});

test('routes task categories to existing gateway task classes', () => {
  assert.equal(routeForTask('research'), 'research');
  assert.equal(routeForTask('development'), 'code');
  assert.equal(routeForTask('marketing'), 'writing');
  assert.equal(routeForTask('operations'), 'analysis');
});


test('passes bounded provenance evidence to the model as untrusted source data', async () => {
  let request;
  const adapter = createN3makAgentAdapter({
    isEnabled: () => true,
    chat: async (messages, options) => {
      request = { messages, options };
      return JSON.stringify({ status: 'completed', summary: 'Reviewed source.', claims: [], proposedActions: [] });
    },
  });
  await adapter({
    task: { objective: 'Summarize source', taskType: 'research' },
    role: 'researcher',
    evidenceIds: ['evidence-1'],
    evidence: [{
      evidenceId: 'evidence-1', sourceType: 'web', sourceUrl: 'https://example.com',
      title: 'Source', content: 'x'.repeat(6000), contentSha256: 'a'.repeat(64),
      classification: 'public', capturedAt: '2026-11-26T12:00:00.000Z',
    }],
    budget: { maxTokens: 1000 },
  });
  const payload = JSON.parse(request.messages[1].content);
  assert.equal(payload.evidence[0].evidenceId, 'evidence-1');
  assert.equal(payload.evidence[0].content.length, 5000);
  assert.match(payload.constraints.join(' '), /untrusted source/);
  assert.equal(request.options.task, 'research');
});

test('refuses to call the model client when the configured adapter is disabled', async () => {
  let called = false;
  const adapter = createN3makAgentAdapter({
    isEnabled: () => false,
    chat: async () => { called = true; return '{}'; },
  });
  await assert.rejects(adapter({
    task: { objective: 'Test', taskType: 'research' },
    role: 'researcher',
  }), /N3MAK_LLM_DISABLED/);
  assert.equal(called, false);
});
