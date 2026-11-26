'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAgentJson, routeForTask } = require('./llm-agent-adapter');

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
