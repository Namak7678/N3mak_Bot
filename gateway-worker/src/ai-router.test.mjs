import test from 'node:test';
import assert from 'node:assert/strict';
import { selectModelCandidates } from './ai-router.mjs';

const allModels = [
  'gpt-oss-20b',
  'llama-3.1-8b',
  'gpt-oss-120b',
  'mistral-small-3.1-24b',
  'qwen2.5-coder-32b',
  'llama-3.3-70b',
];

test('code task prefers the coding model and then allowed fallbacks', () => {
  assert.deepEqual(
    selectModelCandidates({ task: 'code', allowedModels: allModels, defaultModel: 'gpt-oss-20b' }),
    ['qwen2.5-coder-32b', 'gpt-oss-120b', 'gpt-oss-20b', 'llama-3.1-8b', 'mistral-small-3.1-24b', 'llama-3.3-70b']
  );
});

test('task routing never selects a model outside the caller tier', () => {
  assert.deepEqual(
    selectModelCandidates({ task: 'research', allowedModels: ['gpt-oss-20b'], defaultModel: 'gpt-oss-20b' }),
    ['gpt-oss-20b']
  );
});

test('explicit model selection is preserved and does not silently switch models', () => {
  assert.deepEqual(
    selectModelCandidates({ requestedModel: 'llama-3.1-8b', task: 'code', allowedModels: allModels, defaultModel: 'gpt-oss-20b' }),
    ['llama-3.1-8b']
  );
});

test('auto model uses task preferences and unknown tasks are rejected', () => {
  assert.equal(
    selectModelCandidates({ requestedModel: 'auto', task: 'writing', allowedModels: allModels, defaultModel: 'gpt-oss-20b' })[0],
    'mistral-small-3.1-24b'
  );
  assert.throws(
    () => selectModelCandidates({ requestedModel: 'auto', task: 'magic', allowedModels: allModels, defaultModel: 'gpt-oss-20b' }),
    { name: 'RangeError' }
  );
});
