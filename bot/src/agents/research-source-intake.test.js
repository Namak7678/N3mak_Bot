'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalizeSourceUrl, normalizeSearchCandidates, persistResearchCandidates } = require('./research-source-intake');

test('canonicalizes HTTPS URLs and removes tracking fragments', () => {
  assert.equal(
    canonicalizeSourceUrl('https://www.Example.org/page/?utm_source=x#frag'),
    'https://example.org/page?'
  );
});

test('rejects insecure, credentialed, malformed URLs', () => {
  assert.equal(canonicalizeSourceUrl('http://example.org'), null);
  assert.equal(canonicalizeSourceUrl('https://user:pass@example.org'), null);
  assert.equal(canonicalizeSourceUrl('not-a-url'), null);
});

test('deduplicates existing and newly returned hosts, and caps accepted records', () => {
  const result = normalizeSearchCandidates([
    { url: 'https://already.example/a', title: 'duplicate host', excerpt: 'text' },
    { url: 'https://new.example/a?utm_campaign=x', title: 'One', excerpt: 'source passage' },
    { url: 'https://www.new.example/b', title: 'same host', excerpt: 'another passage' },
    { url: 'https://second.example/a', title: 'Two', excerpt: 'another source' },
  ], { existingEvidence: [{ sourceUrl: 'https://already.example/old' }], maxResults: 1 });
  assert.equal(result.acceptedCount, 1);
  assert.equal(result.candidates[0].status, 'candidate_unverified');
  assert.equal(result.rejectedCount, 3);
  assert.equal(result.mode, 'normalize_and_deduplicate_only_no_fetch_or_database_write');
});

test('bounds title and excerpt and computes stable passage digest', () => {
  const result = normalizeSearchCandidates([
    { url: 'https://source.example/a', title: 'T'.repeat(500), excerpt: 'A'.repeat(6000) },
  ]);
  assert.equal(result.candidates[0].title.length, 300);
  assert.equal(result.candidates[0].excerpt.length, 5000);
  assert.match(result.candidates[0].excerptSha256, /^[a-f0-9]{64}$/);
});

test('persists only normalized unverified candidates through explicit store handoff', async () => {
  const calls = [];
  const store = { saveEvidence: async (record) => {
    calls.push(record);
    return { evidence_id: record.evidenceId };
  } };
  const intake = normalizeSearchCandidates([
    { url: 'https://source.example/report', title: 'Report', excerpt: 'Captured passage' },
  ]);
  const result = await persistResearchCandidates({
    candidates: intake.candidates,
    store,
    taskId: 'research-task-1',
  });
  assert.equal(result.storedCount, 1);
  assert.equal(calls[0].sourceType, 'web');
  assert.equal(calls[0].metadata.intakeStatus, 'unverified_search_result_excerpt');
  assert.match(calls[0].evidenceId, /^[0-9a-f-]{36}$/i);
  await assert.rejects(() => persistResearchCandidates({
    candidates: [{ ...intake.candidates[0], status: 'verified' }],
    store,
    taskId: 'research-task-1',
  }), /only_unverified_normalized_candidates_can_be_saved/);
});
