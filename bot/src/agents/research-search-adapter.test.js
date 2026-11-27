'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { executeResearchSearch, uniqueQueries } = require('./research-search-adapter');

test('deduplicates queries and enforces the hard query ceiling', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ query: i === 1 ? '  query 0  ' : 'query ' + i }));
  assert.equal(uniqueQueries(items, 99).length, 8);
  assert.equal(uniqueQueries([{ query: 'same' }, { query: ' SAME ' }]).length, 1);
});

test('fails closed without an injected provider and performs no calls', async () => {
  const result = await executeResearchSearch({ plannedQueries: [{ query: 'find sources' }] });
  assert.equal(result.status, 'provider_unavailable');
  assert.equal(result.executedQueryCount, 0);
});

test('bounds provider results and returns normalized unverified sources', async () => {
  const result = await executeResearchSearch({
    plannedQueries: [{ queryId: 'q1', query: 'one' }, { queryId: 'q2', query: 'two' }],
    provider: async ({ maxResults }) => Array.from({ length: maxResults + 3 }, (_, i) => ({
      url: 'https://host' + i + '.example/source',
      title: 'Source ' + i,
      excerpt: 'Evidence passage ' + i,
    })),
  });
  assert.equal(result.status, 'results_normalized');
  assert.equal(result.candidateCount, 8);
  assert.ok(result.candidates.every((item) => item.status === 'candidate_unverified'));
  assert.equal(result.mode, 'bounded_provider_search_normalize_only_no_database_write');
});

test('rejects duplicate hosts across provider query responses', async () => {
  let call = 0;
  const result = await executeResearchSearch({
    plannedQueries: [{ query: 'first' }, { query: 'second' }],
    provider: async () => {
      call += 1;
      return [{ url: 'https://same.example/' + call, title: 'Source', excerpt: 'passage ' + call }];
    },
  });
  assert.equal(call, 2);
  assert.equal(result.candidateCount, 1);
  assert.ok(result.rejected.some((item) => item.reason === 'duplicate_host'));
});

test('records provider errors without trusting or fabricating candidates', async () => {
  const result = await executeResearchSearch({
    plannedQueries: [{ query: 'fails' }],
    provider: async () => { throw new Error('provider unavailable'); },
  });
  assert.equal(result.status, 'search_failed');
  assert.equal(result.candidateCount, 0);
  assert.equal(result.providerErrorCount, 1);
});

test('enforces a shared deadline and aborts timed-out provider work', async () => {
  const result = await executeResearchSearch({
    plannedQueries: [{ query: 'slow' }, { query: 'never reached' }],
    timeoutMs: 15,
    provider: ({ signal }) => new Promise((resolve) => {
      signal.addEventListener('abort', () => resolve([]), { once: true });
    }),
  });
  assert.equal(result.status, 'provider_timeout');
  assert.equal(result.executedQueryCount, 1);
});
