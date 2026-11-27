'use strict';

const DEFAULT_MAX_QUERIES = 8;
const HARD_MAX_QUERIES = 8;

function safeText(value, max = 500) {
  return typeof value === 'string' ? value.trim().replace(/\\s+/g, ' ').slice(0, max) : '';
}

function buildResearchGapPlan({
  questions = [],
  coverage = null,
  evidenceSupportReview = {},
  contradictionReview = {},
  evidenceBundle = [],
  maxQueries = DEFAULT_MAX_QUERIES,
} = {}) {
  const cap = Number.isSafeInteger(maxQueries)
    ? Math.max(0, Math.min(HARD_MAX_QUERIES, maxQueries))
    : DEFAULT_MAX_QUERIES;
  const questionById = new Map(questions.map((item) => [item.id, item]));
  const gaps = [];
  const coveredMap = new Map((coverage?.coverage || []).map((item) => [item.questionId, item]));
  for (const question of questions) {
    const status = coveredMap.get(question.id)?.status || 'unanswered';
    if (status !== 'covered') {
      gaps.push({ gapType: 'question_unanswered', questionId: question.id, prompt: safeText(question.question), priority: question.required ? 'required' : 'optional' });
    }
  }
  for (const review of (evidenceSupportReview.reviews || [])) {
    if (review.status === 'weak_text_overlap' || review.status === 'missing_evidence') {
      const qids = Array.isArray(review.questionIds) ? review.questionIds : [];
      const linked = qids.map((id) => questionById.get(id)).filter(Boolean);
      const prompt = linked.length ? linked.map((q) => safeText(q.question)).join(' ; ') : safeText(review.claimText);
      if (prompt) gaps.push({ gapType: 'weak_evidence_support', claimId: review.claimId || null, questionIds: qids, prompt, priority: 'review' });
    }
  }
  for (const candidate of (contradictionReview.candidates || [])) {
    const qids = Array.isArray(candidate.sharedQuestionIds) ? candidate.sharedQuestionIds : (Array.isArray(candidate.questionIds) ? candidate.questionIds : []);
    const linked = qids.map((id) => questionById.get(id)).filter(Boolean);
    const prompt = linked.length ? linked.map((q) => safeText(q.question)).join(' ; ') : '';
    if (prompt) gaps.push({ gapType: 'contradiction_candidate', questionIds: qids, prompt, priority: 'review' });
  }

  const seenGaps = new Set();
  const uniqueGaps = gaps.filter((gap) => {
    const key = gap.gapType + ':' + (gap.questionId || gap.questionIds?.join(',') || '') + ':' + gap.prompt.toLowerCase();
    if (seenGaps.has(key)) return false;
    seenGaps.add(key);
    return true;
  });
  const excludedHosts = [...new Set(evidenceBundle.map((e) => {
    try { return new URL(e.sourceUrl).hostname.toLowerCase().replace(/^www\\./, ''); } catch { return ''; }
  }).filter(Boolean))].sort();
  const queries = uniqueGaps.slice(0, cap).map((gap, index) => ({
    queryId: 'gap-' + String(index + 1).padStart(2, '0'),
    gapType: gap.gapType,
    questionId: gap.questionId || null,
    questionIds: gap.questionIds || (gap.questionId ? [gap.questionId] : []),
    query: safeText(gap.prompt, 360) + ' primary sources recent data evidence',
    excludeHosts: excludedHosts,
    priority: gap.priority,
    status: 'planned',
  }));
  return {
    status: queries.length ? 'queries_planned' : 'no_research_gaps_detected',
    mode: 'planning_only_no_network_fetch',
    maxQueries: cap,
    plannedQueryCount: queries.length,
    omittedGapCount: Math.max(0, uniqueGaps.length - queries.length),
    gaps: uniqueGaps.slice(0, 20),
    queries,
    excludedHosts,
    note: 'Queries are drafts only. No web request, source retrieval, evidence capture, or model call was performed.',
  };
}

module.exports = { buildResearchGapPlan };
