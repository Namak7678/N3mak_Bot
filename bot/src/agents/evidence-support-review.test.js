'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assessEvidenceSupport } = require('./evidence-support-review');

test('emits lexical overlap signals without claiming semantic support', () => {
  const result = assessEvidenceSupport(
    [{ text: 'Market demand increased significantly.', evidenceIds: ['e1'] }],
    [{ evidenceId: 'e1', content: 'Market demand increased during the quarter.' }],
  );
  assert.equal(result.reviews[0].status, 'text_overlap_signal');
  assert.ok(result.reviews[0].matchedTerms.includes('market'));
  assert.equal(result.semanticVerdictsProduced, 0);
});

test('flags weak overlap and missing evidence separately', () => {
  const result = assessEvidenceSupport(
    [{ text: 'Revenue expanded rapidly.', evidenceIds: ['e1', 'missing'] }],
    [{ evidenceId: 'e1', content: 'A weather report for tomorrow.' }],
  );
  assert.equal(result.reviews[0].status, 'weak_text_overlap');
  assert.equal(result.reviews[1].status, 'missing_evidence');
});

test('bounds evidence-pair review and marks truncation', () => {
  const claims = Array.from({ length: 10 }, (_, i) => ({
    text: 'Shared claim text', evidenceIds: ['e1', 'e2'],
  }));
  const result = assessEvidenceSupport(claims, [
    { evidenceId: 'e1', content: 'Shared claim text' },
    { evidenceId: 'e2', content: 'Shared claim text' },
  ], { maxPairs: 3 });
  assert.equal(result.reviewCount, 3);
  assert.equal(result.truncated, true);
});

test('rejects invalid limits', () => {
  assert.throws(() => assessEvidenceSupport([], [], { maxPairs: 501 }), /invalid_support_limits/);
});
