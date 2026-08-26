const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway's internal network does not require/support TLS by default.
  // Only force SSL if explicitly requested via DB_SSL=true.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  // Prevent an idle client error from crashing the whole process
  console.error('[db] unexpected pool error:', err.message);
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      language_code TEXT DEFAULT 'en',
      currency TEXT DEFAULT 'USD',
      referred_by BIGINT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT REFERENCES users(telegram_id),
      market TEXT NOT NULL,
      amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('[db] tables ready');
}

async function upsertUser(telegramUser, referredBy) {
  const { id, username, first_name, language_code } = telegramUser;
  await pool.query(
    `INSERT INTO users (telegram_id, username, first_name, language_code, referred_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (telegram_id) DO UPDATE
       SET username = EXCLUDED.username, first_name = EXCLUDED.first_name`,
    [id, username || null, first_name || null, language_code || 'en', referredBy || null]
  );
}

module.exports = { pool, initDb, upsertUser };
