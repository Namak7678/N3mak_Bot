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

test('fallback runner tries one backup after a primary failure', async () => {
  const calls = [];
  const outcome = await runWithFallback(['primary', 'backup', 'third'], async (model) => {
    calls.push(model);
    if (model === 'primary') throw new Error('unavailable');
    return { text: 'answer' };
  });
  assert.deepEqual(calls, ['primary', 'backup']);
  assert.deepEqual(outcome, { model: 'backup', result: { text: 'answer' }, error: null });
});

test('fallback runner treats an empty response as a failed attempt', async () => {
  const calls = [];
  const outcome = await runWithFallback(['primary', 'backup'], async (model) => {
    calls.push(model);
    return model === 'primary' ? { text: '  ' } : { text: 'recovered' };
  });
  assert.deepEqual(calls, ['primary', 'backup']);
  assert.equal(outcome.model, 'backup');
  assert.equal(outcome.result.text, 'recovered');
});

test('fallback runner returns unavailable after both allowed attempts fail', async () => {
  const outcome = await runWithFallback(['primary', 'backup'], async () => { throw new Error('offline'); });
  assert.equal(outcome.model, null);
  assert.equal(outcome.result, null);
  assert.equal(outcome.error.message, 'offline');
});
