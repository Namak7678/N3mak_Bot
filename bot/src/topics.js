// D13 — Topics support (ADR-009). Single source of truth for the six
// forum topics of the N3mak operations room (Supergroup).
//
// Rule: EVERY sendMessage to the operations group MUST go through
// `sendToTopic` so messages land inside the right topic thread.
// Sending without a thread id into a forum group is an error case
// (Telegram drops it into a generic "not found" topic), so we fail
// loudly instead of silently posting outside the room.

/**
 * ADR-009 topic map. THREAD ids come from the Telegram group after the
 * topics are created by the office manager (D17). They are configured
 * via env so the code stays identical across deployments (rule: tokens
 * and ids live in the hosting environment, never in the repo).
 */
const TOPIC_KEYS = ['war-room', 'eng-dev', 'research', 'marketing', 'quality', 'boardroom'];

const TOPIC_TITLES = {
  'war-room': '#war-room — Task distribution 09:00 UTC',
  'eng-dev': '#eng-dev — Commits & engineering',
  'research': '#research — Prospect lists & intel',
  'marketing': '#marketing — Content & campaigns',
  'quality': '#quality — Deliveries & checklists',
  'boardroom': '#boardroom — Decisions & minutes',
};

function parseTopicMap(raw) {
  const map = {};
  if (!raw) return map;
  for (const part of String(raw).split(',')) {
    const [key, value] = part.split('=').map((s) => s && s.trim());
    if (!key || !value || !/^\d+$/.test(value)) continue;
    map[key] = Number(value);
  }
  return map;
}

/** Configured topics for this deployment (from TOPIC_IDS env). */
function getTopics() {
  return parseTopicMap(process.env.TOPIC_IDS);
}

/** True when a group id is the operations room configured for this bot. */
function isOperationsGroup(chatId) {
  const expected = Number(process.env.OPERATIONS_GROUP_ID);
  return Number.isFinite(expected) && Number(chatId) === expected;
}

/** True when every ADR-009 topic has a configured thread id. */
function isFullyConfigured() {
  const map = getTopics();
  return TOPIC_KEYS.every((key) => Number.isInteger(map[key]));
}

function topicListMarkdown() {
  return TOPIC_KEYS.map((k) => `- ${TOPIC_TITLES[k]}${getTopics()[k] ? '' : ' (missing thread id)'}`).join('\n');
}

/**
 * Send a message into a specific topic of the operations group.
 * Fails loudly (throws) when the topic is not configured, so a
 * misconfiguration surfaces in logs instead of silently vanishing.
 *
 * @param {import('telegraf').Telegraf} telegram  bot.telegram
 * @param {string} topicKey one of TOPIC_KEYS
 * @param {string} text message text
 * @param {object} [extra] telegraf extra (reply_markup, parse_mode, ...)
 */
async function sendToTopic(telegram, topicKey, text, extra = {}) {
  const threadId = getTopics()[topicKey];
  if (!Number.isInteger(threadId)) {
    throw new Error(`[topics] thread id for "${topicKey}" is not configured (TOPIC_IDS)`);
  }
  return telegram.sendMessage(Number(process.env.OPERATIONS_GROUP_ID), text, {
    ...extra,
    message_thread_id: threadId,
  });
}

module.exports = {
  TOPIC_KEYS,
  TOPIC_TITLES,
  getTopics,
  parseTopicMap,
  isOperationsGroup,
  isFullyConfigured,
  topicListMarkdown,
  sendToTopic,
};
