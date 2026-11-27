'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assessContradictionCandidates } = require('./contradiction-review');

test('creates review candidates only for claims linked to a shared question', () => {
  const result = assessContradictionCandidates([
    { text: 'Demand is rising.', evidenceIds: ['e1'], questionIds: ['market'] },
    { text: 'Demand is falling.', evidenceIds: ['e2'], questionIds: ['market'] },
    { text: 'Price is stable.', evidenceIds: ['e3'], questionIds: ['pricing'] },
  ]);
  assert.equal(result.candidateCount, 1);
  assert.equal(result.candidates[0].relation, 'undetermined');
  assert.equal(result.candidates[0].status, 'requires_review');
  assert.deepEqual(result.candidates[0].evidenceIds, ['e1', 'e2']);
  assert.equal(result.verdictsProduced, 0);
});

test('does not infer contradiction from wording or shared evidence alone', () => {
  const result = assessContradictionCandidates([
    { text: 'The result is true.', evidenceIds: ['e1'] },
    { text: 'The result is false.', evidenceIds: ['e1'] },
  ]);
  assert.equal(result.candidateCount, 0);
});

test('bounds candidate generation and marks truncation', () => {
  const claims = Array.from({ length: 20 }, (_, i) => ({
    text: `Claim ${i}`, evidenceIds: [`e${i}`], questionIds: ['same'],
  }));
  const result = assessContradictionCandidates(claims, { maxPairs: 5 });
  assert.equal(result.candidateCount, 5);
  assert.equal(result.truncated, true);
});

test('rejects malformed inputs and unsafe limits', () => {
  assert.throws(() => assessContradictionCandidates({}), /invalid_contradiction_claims/);
  assert.throws(() => assessContradictionCandidates([], { maxPairs: 501 }), /invalid_contradiction_pair_limit/);
});
