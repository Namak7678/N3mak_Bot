// D13 — tests for bot/src/topics.js
// Characterization contract:
// 1. parseTopicMap accepts only key=integer pairs, ignores garbage.
// 2. sendToTopic ALWAYS attaches message_thread_id to the group sendMessage.
// 3. sendToTopic fails loudly when a topic is not configured.

const assert = require('assert');
const {
  parseTopicMap,
  getTopics,
  isOperationsGroup,
  isFullyConfigured,
  sendToTopic,
  TOPIC_KEYS,
} = require('./topics');

process.env.OPERATIONS_GROUP_ID = '-1001234567890';

function makeFakeTelegram() {
  const calls = [];
  return {
    calls,
    sendMessage: async (chatId, text, extra) => {
      calls.push({ chatId, text, extra });
      return { message_id: calls.length };
    },
  };
}

// 1) parseTopicMap
assert.deepStrictEqual(parseTopicMap('war-room=12,eng-dev=34,research=56'), { 'war-room': 12, 'eng-dev': 34, research: 56 });
assert.deepStrictEqual(parseTopicMap('bad=x,war-room=12,,eng-dev==9,quality=77'), { 'war-room': 12, quality: 77 });
assert.deepStrictEqual(parseTopicMap(''), {});
assert.deepStrictEqual(parseTopicMap(undefined), {});
console.log('[topics.test] parseTopicMap ok');

// 2) sendToTopic always carries message_thread_id
const fake = makeFakeTelegram();
process.env.TOPIC_IDS = 'war-room=12,eng-dev=34,research=56,marketing=78,quality=90,boardroom=99';
(async () => {
  for (const key of TOPIC_KEYS) {
    await sendToTopic(fake, key, `hello ${key}`);
  }
  assert.strictEqual(fake.calls.length, 6);
  for (const call of fake.calls) {
    assert.strictEqual(call.chatId, -1001234567890);
    assert.ok(Number.isInteger(call.extra.message_thread_id), 'thread id must be an integer');
  }
  assert.strictEqual(fake.calls[0].extra.message_thread_id, 12);
  assert.strictEqual(fake.calls[4].extra.message_thread_id, 90);
  console.log('[topics.test] sendToTopic routing ok');

  // 3) unconfigured topic fails loudly
  process.env.TOPIC_IDS = 'war-room=12';
  let threw = false;
  try {
    await sendToTopic(fake, 'boardroom', 'should throw');
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('boardroom'));
  }
  assert.ok(threw, 'sendToTopic must throw on unconfigured topic');
  console.log('[topics.test] fail-loud ok');

  // env helpers
  assert.strictEqual(isOperationsGroup(-1001234567890), true);
  assert.strictEqual(isOperationsGroup(123), false);
  assert.strictEqual(isFullyConfigured(), false);
  assert.strictEqual(getTopics()['war-room'], 12);
  console.log('[topics.test] env helpers ok');

  console.log('[topics.test] ALL PASS');
})();
