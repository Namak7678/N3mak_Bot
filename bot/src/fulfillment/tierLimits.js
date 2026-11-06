/**
 * Per-plan OmniRoute key limits (from marketing/tier-proposal.md — now enforced).
 */
const PIONEER = 'plan_n2uiwphhI5YG7';
const STARTER = 'plan_IkWmnOwW1ShYY';
const PRO = 'plan_SrqGnbkktuOUc';

/** Free / CFP playground models for Pioneer */
const PIONEER_MODELS = [
  'cfp/openai/gpt-oss-20b',
  'cfp/openai/gpt-oss-120b',
  'cfp/zai-org/glm-4.7-flash',
  'cfp/deepseek-ai/deepseek-v4-flash-0731',
  'cfp/meta/llama-3.1-8b-instruct-fp8',
  'cfp/meta/llama-4-scout-17b-16e-instruct',
  'cfp/qwen/qwen2.5-coder-32b-instruct',
  'cfp/mistralai/mistral-small-3.1-24b-instruct',
  'cfp/*',
];

/** Free + mid-tier for Starter */
const STARTER_MODELS = [
  ...PIONEER_MODELS,
  'cfp/moonshotai/kimi-k2.6',
  'cfp/moonshotai/kimi-k2.7-code',
  'cfp/deepseek-ai/deepseek-v4-pro-0813',
  'cfp/zai-org/glm-5.2',
  'cfp/meta-llama/llama-3.3-70b-instruct-fp8-fast',
  'cfp/qwen/qwen3-30b-a3b-fp8',
  'cfp/qwen/qwq-32b',
  'cfp/google/gemma-4-26b-a4b-it',
];

const TIERS = {
  [PIONEER]: {
    name: 'pioneer',
    label: 'Pioneer $3',
    maxRequestsPerDay: 200,
    maxRequestsPerMinute: 5,
    modelAccessMode: 'restricted',
    allowedModels: PIONEER_MODELS,
    usageLimitEnabled: true,
    dailyUsageLimitUsd: 0.5,
  },
  [STARTER]: {
    name: 'starter',
    label: 'Starter $9',
    maxRequestsPerDay: 1000,
    maxRequestsPerMinute: 20,
    modelAccessMode: 'restricted',
    allowedModels: STARTER_MODELS,
    usageLimitEnabled: true,
    dailyUsageLimitUsd: 3,
  },
  [PRO]: {
    name: 'pro',
    label: 'Pro $49',
    maxRequestsPerDay: 10000,
    maxRequestsPerMinute: 60,
    modelAccessMode: 'all',
    allowedModels: [],
    usageLimitEnabled: true,
    dailyUsageLimitUsd: 20,
  },
};

function resolvePlanKey(plan) {
  if (!plan) return PIONEER;
  const s = String(plan).toLowerCase();
  if (TIERS[plan]) return plan;
  if (s === 'pioneer' || s.includes('n2uiwphh')) return PIONEER;
  if (s === 'starter' || s.includes('ikwmnow')) return STARTER;
  if (s === 'pro' || s.includes('srqgnbk')) return PRO;
  return PIONEER;
}

function getTierLimits(plan) {
  return TIERS[resolvePlanKey(plan)];
}

module.exports = {
  PIONEER,
  STARTER,
  PRO,
  TIERS,
  getTierLimits,
  resolvePlanKey,
  PIONEER_MODELS,
  STARTER_MODELS,
};
