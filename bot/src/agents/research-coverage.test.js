'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assessQuestionCoverage } = require('./research-coverage');

test('maps evidence-linked claims to required and optional research questions', () => {
  const result = assessQuestionCoverage([
    { id: 'market', question: 'Is there demand?', required: true },
    { id: 'pricing', question: 'What price works?', required: true },
    { id: 'risks', question: 'What can fail?', required: false },
  ], [
    { text: 'Demand signal exists.', evidenceIds: ['e1'], questionIds: ['market'] },
    { text: 'A second demand signal.', evidenceIds: ['e2'], questionIds: ['market'] },
  ]);
  assert.equal(result.complete, false);
  assert.deepEqual(result.unansweredRequired, ['pricing']);
  assert.deepEqual(result.coverage.map((item) => item.status), ['covered', 'unanswered', 'unanswered']);
  assert.equal(result.coverage[0].supportedClaimCount, 2);
  assert.deepEqual(result.coverage[0].evidenceIds, ['e1', 'e2']);
});

test('rejects claim links to unknown questions', () => {
  assert.throws(() => assessQuestionCoverage(
    [{ id: 'known', question: 'Known?', required: true }],
    [{ text: 'Claim', evidenceIds: ['e1'], questionIds: ['unknown'] }],
  ), /unknown_research_question_reference/);
});

test('does not count claims without evidence as question coverage', () => {
  const result = assessQuestionCoverage(
    [{ id: 'q1', question: 'Question?', required: true }],
    [{ text: 'No source', evidenceIds: [], questionIds: ['q1'] }],
  );
  assert.equal(result.complete, false);
  assert.equal(result.coverage[0].status, 'unanswered');
});
