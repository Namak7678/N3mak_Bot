'use strict';

function assessQuestionCoverage(questions, claims) {
  if (!Array.isArray(questions) || !Array.isArray(claims)) throw new TypeError('invalid_question_coverage_input');
  const known = new Set(questions.map((question) => question.id));
  const linked = new Map(questions.map((question) => [question.id, []]));
  for (const claim of claims) {
    if (!Array.isArray(claim.questionIds)) continue;
    for (const questionId of claim.questionIds) {
      if (!known.has(questionId)) throw new TypeError('unknown_research_question_reference');
      if (Array.isArray(claim.evidenceIds) && claim.evidenceIds.length > 0) linked.get(questionId).push(claim);
    }
  }
  const coverage = questions.map((question) => {
    const supportingClaims = linked.get(question.id);
    return {
      questionId: question.id, question: question.question, required: question.required,
      status: supportingClaims.length ? 'covered' : 'unanswered',
      supportedClaimCount: supportingClaims.length,
      evidenceIds: [...new Set(supportingClaims.flatMap((claim) => claim.evidenceIds))],
    };
  });
  const unansweredRequired = coverage.filter((item) => item.required && item.status === 'unanswered')
    .map((item) => item.questionId);
  return {
    totalQuestions: coverage.length,
    coveredQuestions: coverage.filter((item) => item.status === 'covered').length,
    unansweredQuestions: coverage.filter((item) => item.status === 'unanswered').length,
    coverage, unansweredRequired, complete: unansweredRequired.length === 0,
  };
}

module.exports = { assessQuestionCoverage };
