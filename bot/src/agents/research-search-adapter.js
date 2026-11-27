'use strict';

const { normalizeSearchCandidates } = require('./research-source-intake');

const HARD_MAX_QUERIES = 8;
const HARD_MAX_RESULTS_PER_QUERY = 8;
const DEFAULT_TIMEOUT_MS = 20_000;
const HARD_MAX_TIMEOUT_MS = 60_000;

function uniqueQueries(plannedQueries, maxQueries) {
  const cap = Number.isSafeInteger(maxQueries)
    ? Math.max(0, Math.min(HARD_MAX_QUERIES, maxQueries))
    : HARD_MAX_QUERIES;
  const seen = new Set();
  const output = [];
  for (const item of Array.isArray(plannedQueries) ? plannedQueries : []) {
    const query = typeof item?.query === 'string' ? item.query.trim().replace(/\s+/g, ' ').slice(0, 360) : '';
    const key = query.toLowerCase();
    if (!query || seen.has(key)) continue;
    seen.add(key);
    output.push({ ...item, query });
    if (output.length >= cap) break;
  }
  return output;
}

async function invokeWithDeadline(provider, request, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => provider({ ...request, signal: controller.signal })),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error('research_provider_timeout'), { code: 'RESEARCH_PROVIDER_TIMEOUT' }));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function executeResearchSearch({
  plannedQueries = [],
  provider,
  existingEvidence = [],
  maxQueries = HARD_MAX_QUERIES,
  maxResultsPerQuery = HARD_MAX_RESULTS_PER_QUERY,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  clock = () => Date.now(),
} = {}) {
  const queries = uniqueQueries(plannedQueries, maxQueries);
  if (typeof provider !== 'function') {
    return {
      status: 'provider_unavailable',
      executedQueryCount: 0,
      candidates: [],
      rejected: [],
      note: 'No search provider is configured; no network request was made.',
    };
  }
  const queryCap = Number.isSafeInteger(maxResultsPerQuery)
    ? Math.max(1, Math.min(HARD_MAX_RESULTS_PER_QUERY, maxResultsPerQuery))
    : HARD_MAX_RESULTS_PER_QUERY;
  const budgetMs = Number.isSafeInteger(timeoutMs)
    ? Math.max(1, Math.min(HARD_MAX_TIMEOUT_MS, timeoutMs))
    : DEFAULT_TIMEOUT_MS;
  const deadline = clock() + budgetMs;
  const candidates = [];
  const rejected = [];
  let executedQueryCount = 0;
  let providerErrorCount = 0;
  let timedOut = false;

  for (const planned of queries) {
    const remainingMs = deadline - clock();
    if (remainingMs <= 0) break;
    executedQueryCount += 1;
    let rawResults;
    try {
      rawResults = await invokeWithDeadline(provider, {
        query: planned.query,
        excludeHosts: Array.isArray(planned.excludeHosts) ? planned.excludeHosts.slice(0, 100) : [],
        maxResults: queryCap,
        timeoutMs: remainingMs,
        queryId: planned.queryId || null,
      }, remainingMs);
      if (!Array.isArray(rawResults)) throw new TypeError('provider_results_must_be_array');
    } catch (error) {
      providerErrorCount += 1;
      if (error?.code === 'RESEARCH_PROVIDER_TIMEOUT') {
        timedOut = true;
        break;
      }
      rejected.push({ queryId: planned.queryId || null, reason: 'provider_query_failed' });
      continue;
    }
    const normalized = normalizeSearchCandidates(rawResults.slice(0, queryCap), {
      existingEvidence: [...existingEvidence, ...candidates.map((candidate) => ({ sourceUrl: candidate.sourceUrl }))],
      maxResults: Math.max(0, HARD_MAX_RESULTS_PER_QUERY - candidates.length),
    });
    candidates.push(...normalized.candidates);
    rejected.push(...normalized.rejected.map((item) => ({
      queryId: planned.queryId || null,
      ...item,
    })));
    if (candidates.length >= HARD_MAX_RESULTS_PER_QUERY) break;
  }

  const budgetExhausted = deadline - clock() <= 0;
  return {
    status: timedOut ? 'provider_timeout'
      : budgetExhausted ? 'budget_exhausted'
        : providerErrorCount && !candidates.length ? 'search_failed'
          : 'results_normalized',
    executedQueryCount,
    providerErrorCount,
    candidateCount: candidates.length,
    candidates,
    rejected,
    deadlineAtMs: deadline,
    mode: 'bounded_provider_search_normalize_only_no_database_write',
    note: 'All returned passages remain unverified. Call the existing evidence-store handoff explicitly; normalization is not verification.',
  };
}

module.exports = { executeResearchSearch, uniqueQueries };
