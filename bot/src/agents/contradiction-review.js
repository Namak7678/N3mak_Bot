'use strict';

function assessContradictionCandidates(claims, { maxPairs = 100 } = {}) {
  if (!Array.isArray(claims) || claims.length > 100) throw new TypeError('invalid_contradiction_claims');
  if (!Number.isSafeInteger(maxPairs) || maxPairs < 1 || maxPairs > 500) throw new TypeError('invalid_contradiction_pair_limit');
  const normalized = claims.map((claim, index) => {
    if (!claim || typeof claim.text !== 'string' || !Array.isArray(claim.evidenceIds)) {
      throw new TypeError('invalid_contradiction_claim');
    }
    const questionIds = Array.isArray(claim.questionIds) ? [...new Set(claim.questionIds)] : [];
    return { claimId: typeof claim.claimId === 'string' ? claim.claimId : `claim-${index + 1}`, text: claim.text, evidenceIds: [...new Set(claim.evidenceIds)], questionIds };
  });
  const candidates = [];
  const truncated = false;
  for (let left = 0; left < normalized.length; left += 1) {
    for (let right = left + 1; right < normalized.length; right += 1) {
      const a = normalized[left], b = normalized[right];
      const sharedQuestionIds = a.questionIds.filter((id) => b.questionIds.includes(id));
      if (!sharedQuestionIds.length) continue;
      if (candidates.length >= maxPairs) {
        return { candidateCount: candidates.length, candidates, truncated: true, verdictsProduced: 0 };
      }
      candidates.push({
        leftClaimId: a.claimId,
        rightClaimId: b.claimId,
        sharedQuestionIds,
        evidenceIds: [...new Set([...a.evidenceIds, ...b.evidenceIds])],
        relation: 'undetermined',
        status: 'requires_review',
        confidence: null,
        rationale: 'Claims address at least one shared research question. Shared scope is a review signal, not proof of contradiction.',
      });
    }
  }
  return { candidateCount: candidates.length, candidates, truncated, verdictsProduced: 0 };
}

module.exports = { assessContradictionCandidates };
