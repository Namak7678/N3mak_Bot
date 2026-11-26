// Unit tests for realtor lead topic parsing.
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

describe('realtor-lead parseTopicIds', () => {
  const { parseTopicIds } = require('../src/realtor-lead');

  it('parses configured topic ids', () => {
    const ids = parseTopicIds('war-room=12,eng-dev=13,research=14,marketing=15,quality=16,boardroom=17');
    assert.equal(ids['war-room'], 12);
    assert.equal(ids['boardroom'], 17);
  });

  it('ignores empty or malformed pairs', () => {
    const ids = parseTopicIds('war-room=,eng-dev=7,');
    assert.equal(ids['eng-dev'], 7);
    assert.equal(ids['war-room'], undefined);
  });

  it('handles missing env value', () => {
    const ids = parseTopicIds(undefined);
    assert.deepEqual(ids, {});
  });
});
