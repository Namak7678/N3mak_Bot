'use strict';

const STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','in','is','it','of','on','or','that','the','to','was','were','with',
  'في','من','على','الى','إلى','عن','أن','إن','هو','هي','و','او','أو','هذا','هذه','تم','قد'
]);

function tokens(value) {
  return String(value || '').toLowerCase()
    .normalize('NFKC')
    .match(/[\p{L}\p{N}]{3,}/gu) || [];
}

function assessEvidenceSupport(claims, evidenceBundle, { maxPairs = 100, maxTokensPerText = 500 } = {}) {
  if (!Array.isArray(claims) || claims.length > 100) throw new TypeError('invalid_support_claims');
  if (!Array.isArray(evidenceBundle) || evidenceBundle.length > 10) throw new TypeError('invalid_support_evidence');
  if (!Number.isSafeInteger(maxPairs) || maxPairs < 1 || maxPairs > 500 ||
      !Number.isSafeInteger(maxTokensPerText) || maxTokensPerText < 10 || maxTokensPerText > 2000) {
    throw new TypeError('invalid_support_limits');
  }
  const byId = new Map(evidenceBundle.map((item) => [item.evidenceId, item]));
  const reviews = [];
  let truncated = false;
  for (let claimIndex = 0; claimIndex < claims.length; claimIndex += 1) {
    const claim = claims[claimIndex];
    if (!claim || typeof claim.text !== 'string' || !Array.isArray(claim.evidenceIds)) {
      throw new TypeError('invalid_support_claim');
    }
    const claimTokens = [...new Set(tokens(claim.text).slice(0, maxTokensPerText))];
    for (const evidenceId of [...new Set(claim.evidenceIds)]) {
      if (reviews.length >= maxPairs) { truncated = true; break; }
      const evidence = byId.get(evidenceId);
      if (!evidence) {
        reviews.push({ claimIndex, evidenceId, status: 'missing_evidence', matchedTerms: [], overlapRatio: 0 });
        continue;
      }
      const passageTokens = new Set(tokens(evidence.content).slice(0, maxTokensPerText));
      const matchedTerms = claimTokens.filter((term) => passageTokens.has(term));
      const overlapRatio = claimTokens.length ? Number((matchedTerms.length / claimTokens.length).toFixed(3)) : 0;
      reviews.push({
        claimIndex,
        evidenceId,
        status: matchedTerms.length ? 'text_overlap_signal' : 'weak_text_overlap',
        matchedTerms: matchedTerms.slice(0, 20),
        overlapRatio,
      });
    }
    if (truncated) break;
  }
  return {
    reviewCount: reviews.length,
    reviews,
    truncated,
    semanticVerdictsProduced: 0,
    limitation: 'Lexical overlap is only a navigation signal. It does not establish entailment, context, date validity, source credibility, or factual support.',
  };
}

module.exports = { assessEvidenceSupport, tokens };
