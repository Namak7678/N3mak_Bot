'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalizeSourceUrl, createEvidenceRecord, verifyEvidenceRecord } = require('./evidence-contract');

test('canonicalizes web source URLs and strips common tracking parameters', () => {
  assert.equal(
    canonicalizeSourceUrl('HTTPS://Example.COM/reports/?utm_source=mail&id=7#section'),
    'https://example.com/reports?id=7',
  );
});

test('rejects non-http and credential-bearing evidence URLs', () => {
  assert.throws(() => canonicalizeSourceUrl('file:///etc/passwd'), /unsafe_evidence_url/);
  assert.throws(() => canonicalizeSourceUrl('https://user:pass@example.com/'), /unsafe_evidence_url/);
});

test('creates a provenance record with deterministic content digest', () => {
  const now = new Date('2026-11-26T12:00:00.000Z');
  const record = createEvidenceRecord({
    evidenceId: 'evidence-001',
    sourceType: 'web',
    sourceUrl: 'https://example.com/page?utm_campaign=x',
    title: 'Source title',
    content: 'Verified excerpt text',
  }, now);
  assert.equal(record.sourceUrl, 'https://example.com/page');
  assert.equal(record.contentSha256.length, 64);
  assert.equal(record.capturedAt, now.toISOString());
  assert.equal(record.classification, 'public');
});

test('requires a URL for web evidence and bounds stored content', () => {
  assert.throws(() => createEvidenceRecord({
    evidenceId: 'e1', sourceType: 'web', title: 'Title', content: 'Text',
  }), /web_evidence_requires_url/);
  assert.throws(() => createEvidenceRecord({
    evidenceId: 'e1', sourceType: 'user_note', title: 'Title', content: 'x'.repeat(20001),
  }), /invalid_evidence_content/);
});


test('flags duplicate canonical URLs and narrow source diversity without rejecting evidence', () => {
  const { assessEvidenceDiversity } = require('./evidence-contract');
  const assessment = assessEvidenceDiversity([
    { evidenceId: 'e1', sourceType: 'web', sourceUrl: 'https://example.com/a?utm_source=x' },
    { evidenceId: 'e2', sourceType: 'web', sourceUrl: 'https://example.com/a#section' },
    { evidenceId: 'e3', sourceType: 'document', sourceUrl: null },
  ]);
  assert.equal(assessment.evidenceCount, 3);
  assert.equal(assessment.uniqueWebHostCount, 1);
  assert.deepEqual(assessment.duplicateSources, [{
    sourceUrl: 'https://example.com/a',
    evidenceIds: ['e1', 'e2'],
  }]);
  assert.deepEqual(assessment.warnings, ['duplicate_source_urls', 'single_web_domain']);
});

test('reports missing evidence as a source gap', () => {
  const { assessEvidenceDiversity } = require('./evidence-contract');
  assert.deepEqual(assessEvidenceDiversity([]), {
    evidenceCount: 0,
    uniqueWebHostCount: 0,
    sourceTypeCounts: {},
    duplicateSources: [],
    warnings: ['no_evidence'],
  });
});

test('verifies evidence digest and detects content tampering', () => {
  const record = createEvidenceRecord({
    evidenceId: 'evidence-verify',
    sourceType: 'user_note',
    title: 'Captured note',
    content: 'Original content',
  });
  const storedShape = { content_text: record.content, content_sha256: record.contentSha256 };
  assert.equal(verifyEvidenceRecord(storedShape), true);
  assert.equal(verifyEvidenceRecord({ ...storedShape, content_text: 'Changed content' }), false);
});
