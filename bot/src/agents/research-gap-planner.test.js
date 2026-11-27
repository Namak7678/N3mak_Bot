'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildResearchGapPlan } = require('./research-gap-planner');

test('plans targeted queries for unanswered required questions and excludes known hosts', () => {
  const plan = buildResearchGapPlan({
    questions: [{ id: 'pricing', question: 'What price do customers accept?', required: true }],
    coverage: { coverage: [{ questionId: 'pricing', status: 'unanswered' }] },
    evidenceBundle: [{ sourceUrl: 'https://www.example.org/page' }],
  });
  assert.equal(plan.mode, 'planning_only_no_network_fetch');
  assert.equal(plan.plannedQueryCount, 1);
  assert.match(plan.queries[0].query, /What price do customers accept/);
  assert.deepEqual(plan.queries[0].excludeHosts, ['example.org']);
});

test('deduplicates equivalent gaps and enforces a hard maximum of eight queries', () => {
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: 'q' + i, question: 'Question ' + i, required: true,
  }));
  const plan = buildResearchGapPlan({ questions, coverage: { coverage: [] }, maxQueries: 99 });
  assert.equal(plan.maxQueries, 8);
  assert.equal(plan.plannedQueryCount, 8);
  assert.equal(plan.omittedGapCount, 2);
});

test('does not claim to fetch or verify sources', () => {
  const plan = buildResearchGapPlan();
  assert.equal(plan.plannedQueryCount, 0);
  assert.match(plan.note, /No web request/);
});
