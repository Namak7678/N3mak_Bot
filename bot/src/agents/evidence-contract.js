'use strict';

const { createHash } = require('node:crypto');

const SOURCE_TYPES = Object.freeze(['web', 'document', 'user_note', 'api']);
const CLASSIFICATIONS = Object.freeze(['public', 'internal', 'confidential', 'restricted']);
const TRACKING_PARAMS = /^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalizeSourceUrl(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048) throw new TypeError('invalid_evidence_url');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('invalid_evidence_url');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new TypeError('unsafe_evidence_url');
  }
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

function verifyEvidenceRecord(record) {
  if (!record || typeof record.content_text !== 'string' || typeof record.content_sha256 !== 'string') return false;
  const digest = createHash('sha256').update(record.content_text.trim(), 'utf8').digest('hex');
  return digest === record.content_sha256;
}

function createEvidenceRecord(input, now = new Date()) {
  if (!isPlainObject(input)) throw new TypeError('evidence_must_be_object');
  const allowed = ['evidenceId', 'sourceType', 'sourceUrl', 'title', 'content', 'classification', 'metadata'];
  const unexpected = Object.keys(input).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new TypeError('unexpected_evidence_fields');
  if (typeof input.evidenceId !== 'string' || !input.evidenceId.trim() || input.evidenceId.length > 160) {
    throw new TypeError('invalid_evidence_id');
  }
  if (!SOURCE_TYPES.includes(input.sourceType)) throw new TypeError('invalid_evidence_source_type');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 300) {
    throw new TypeError('invalid_evidence_title');
  }
  if (typeof input.content !== 'string' || !input.content.trim() || input.content.length > 20000) {
    throw new TypeError('invalid_evidence_content');
  }
  const classification = input.classification || 'public';
  if (!CLASSIFICATIONS.includes(classification)) throw new TypeError('invalid_evidence_classification');
  if (!isPlainObject(input.metadata || {})) throw new TypeError('invalid_evidence_metadata');
  const metadata = input.metadata || {};
  if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 4000) {
    throw new RangeError('evidence_metadata_too_large');
  }
  const sourceUrl = canonicalizeSourceUrl(input.sourceUrl);
  if (input.sourceType === 'web' && !sourceUrl) throw new TypeError('web_evidence_requires_url');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('invalid_evidence_capture_time');
  return Object.freeze({
    evidenceId: input.evidenceId,
    sourceType: input.sourceType,
    sourceUrl,
    title: input.title.trim(),
    content: input.content.trim(),
    contentSha256: createHash('sha256').update(input.content.trim(), 'utf8').digest('hex'),
    classification,
    metadata,
    capturedAt: now.toISOString(),
  });
}

function assessEvidenceDiversity(records) {
  if (!Array.isArray(records)) throw new TypeError('invalid_evidence_records');
  const sourceTypeCounts = {};
  const hosts = new Set();
  const seenUrls = new Map();
  let webSourceCount = 0;
  for (const record of records) {
    if (!record || typeof record.evidenceId !== 'string' || !SOURCE_TYPES.includes(record.sourceType)) {
      throw new TypeError('invalid_evidence_record');
    }
    sourceTypeCounts[record.sourceType] = (sourceTypeCounts[record.sourceType] || 0) + 1;
    if (record.sourceType !== 'web' || !record.sourceUrl) continue;
    webSourceCount += 1;
    let canonicalUrl;
    try {
      canonicalUrl = canonicalizeSourceUrl(record.sourceUrl);
    } catch {
      continue;
    }
    const host = new URL(canonicalUrl).hostname.toLowerCase();
    hosts.add(host);
    const ids = seenUrls.get(canonicalUrl) || [];
    ids.push(record.evidenceId);
    seenUrls.set(canonicalUrl, ids);
  }
  const duplicateSources = [...seenUrls.entries()]
    .filter(([, evidenceIds]) => evidenceIds.length > 1)
    .map(([sourceUrl, evidenceIds]) => ({ sourceUrl, evidenceIds }));
  const warnings = [];
  if (!records.length) warnings.push('no_evidence');
  if (duplicateSources.length) warnings.push('duplicate_source_urls');
  if (webSourceCount > 1 && hosts.size === 1) warnings.push('single_web_domain');
  if (records.length > 0 && Object.keys(sourceTypeCounts).length === 1) warnings.push('single_source_type');
  return {
    evidenceCount: records.length,
    uniqueWebHostCount: hosts.size,
    sourceTypeCounts,
    duplicateSources,
    warnings,
  };
}

module.exports = { SOURCE_TYPES, CLASSIFICATIONS, canonicalizeSourceUrl, createEvidenceRecord, verifyEvidenceRecord, assessEvidenceDiversity };
