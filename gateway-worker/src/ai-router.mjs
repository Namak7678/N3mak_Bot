const TASK_PREFERENCES = Object.freeze({
  general: ['gpt-oss-20b', 'llama-3.1-8b', 'mistral-small-3.1-24b', 'gpt-oss-120b', 'llama-3.3-70b'],
  chat: ['gpt-oss-20b', 'llama-3.1-8b', 'mistral-small-3.1-24b'],
  research: ['gpt-oss-120b', 'llama-3.3-70b', 'gpt-oss-20b', 'llama-3.1-8b'],
  code: ['qwen2.5-coder-32b', 'gpt-oss-120b', 'gpt-oss-20b', 'llama-3.1-8b', 'mistral-small-3.1-24b', 'llama-3.3-70b'],
  analysis: ['gpt-oss-120b', 'llama-3.3-70b', 'gpt-oss-20b', 'llama-3.1-8b'],
  writing: ['mistral-small-3.1-24b', 'gpt-oss-20b', 'llama-3.1-8b'],
  support: ['llama-3.1-8b', 'gpt-oss-20b', 'mistral-small-3.1-24b'],
  review: ['gpt-oss-120b', 'llama-3.3-70b', 'gpt-oss-20b'],
});

export const SUPPORTED_AI_TASKS = Object.freeze(Object.keys(TASK_PREFERENCES));

export function selectModelCandidates({
  requestedModel,
  task,
  allowedModels = [],
  defaultModel = 'gpt-oss-20b',
} = {}) {
  const hasTask = task !== undefined && task !== null && String(task).trim() !== '';
  const normalizedTask = hasTask ? String(task).trim().toLowerCase() : 'general';
  if (!TASK_PREFERENCES[normalizedTask]) {
    throw new RangeError(`Unsupported AI task: ${normalizedTask}`);
  }

  if (requestedModel && requestedModel !== 'auto' && requestedModel !== 'n3mak/auto') {
    return [String(requestedModel)];
  }

  if (!hasTask && !requestedModel) return [defaultModel];

  const allowed = new Set(allowedModels);
  const preferred = TASK_PREFERENCES[normalizedTask].filter((model) => allowed.has(model));
  const remaining = allowedModels.filter((model) => !preferred.includes(model));
  const candidates = [...preferred, ...remaining];
  return candidates.length ? candidates : [defaultModel];
}

export async function runWithFallback() {
  return null;
}
