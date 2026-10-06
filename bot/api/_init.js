// Database initialization wrapper for Vercel serverless
const { pool, initDb } = require('../src/db');

let initialized = false;
let initPromise = null;

async function ensureDbReady() {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await initDb();
      initialized = true;
    } catch (err) {
      console.error('[db] initialization failed:', err.message);
      throw err;
    }
  })();

  return initPromise;
}

module.exports = { ensureDbReady, pool };
