// Lazy, once-per-cold-start DB init for the serverless (Vercel) runtime.
// initDb() itself is idempotent (CREATE TABLE IF NOT EXISTS), so calling
// it again on a later cold start is always safe.
const { initDb } = require('../src/db');

let initPromise = null;
function ensureDbReady() {
  if (!initPromise) {
    initPromise = initDb().catch((err) => {
      console.error('[db] init failed:', err.message);
      initPromise = null; // allow retry on next invocation
      throw err;
    });
  }
  return initPromise;
}

module.exports = { ensureDbReady };
