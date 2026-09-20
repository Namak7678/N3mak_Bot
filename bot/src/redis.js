const Redis = require('ioredis');

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_MESSAGES = 20;

// Only connect when REDIS_URL is set. Without it, rate limiting fails open
// so the bot still loads cleanly in local/dev without a Redis instance.
let redis = null;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 2000),
    lazyConnect: false,
  });
  redis.on('error', (err) => console.error('[redis] error:', err.message));
  redis.on('connect', () => console.log('[redis] connected'));
} else {
  console.log('[redis] REDIS_URL not set — rate limiting disabled (fail-open)');
}

// true = allowed, false = blocked (flood)
async function checkRateLimit(telegramId) {
  if (!redis) return true;
  const key = `ratelimit:${telegramId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
  }
  return count <= RATE_LIMIT_MAX_MESSAGES;
}

module.exports = { redis, checkRateLimit };
