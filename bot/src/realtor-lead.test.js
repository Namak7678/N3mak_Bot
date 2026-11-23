// اختبار وحدة مسار عملاء العقارات — قاعدة الشركة: لا تسليم بلا اختبار
const assert = require('assert');

describe('realtor-lead parseTopicIds', () => {
  const { parseTopicIds } = require('../src/realtor-lead');

  it('parses configured topic ids', () => {
    const ids = parseTopicIds('war-room=12,eng-dev=13,research=14,marketing=15,quality=16,boardroom=17');
    assert.strictEqual(ids['war-room'], 12);
    assert.strictEqual(ids['boardroom'], 17);
  });

  it('ignores empty or malformed pairs', () => {
    const ids = parseTopicIds('war-room=,eng-dev=7,');
    assert.strictEqual(ids['eng-dev'], 7);
    assert.strictEqual(ids['war-room'], undefined);
  });

  it('handles missing env value', () => {
    const ids = parseTopicIds(undefined);
    assert.deepStrictEqual(ids, {});
  });
});
