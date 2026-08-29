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
      balance_usd NUMERIC(18,2) NOT NULL DEFAULT 0,
      referred_by BIGINT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_usd NUMERIC(18,2) NOT NULL DEFAULT 0;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deposits (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL,
      amount_usd NUMERIC(18,2) NOT NULL,
      stripe_session_id TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'completed',
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

async function getBalance(telegramId) {
  const r = await pool.query('SELECT balance_usd FROM users WHERE telegram_id = $1', [telegramId]);
  return r.rows[0] ? Number(r.rows[0].balance_usd) : 0;
}

// Idempotent: relies on the UNIQUE constraint on stripe_session_id so a
// retried/duplicated Stripe webhook event can never double-credit a wallet.
async function creditDeposit(telegramId, amountUsd, stripeSessionId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO deposits (telegram_id, amount_usd, stripe_session_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (stripe_session_id) DO NOTHING
       RETURNING id`,
      [telegramId, amountUsd, stripeSessionId]
    );
    if (inserted.rowCount > 0) {
      await client.query(
        'UPDATE users SET balance_usd = balance_usd + $1 WHERE telegram_id = $2',
        [amountUsd, telegramId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function upsertUser(telegramUser, referredBy) {
  const { id, username, first_name, language_code } = telegramUser;
  const result = await pool.query(
    `INSERT INTO users (telegram_id, username, first_name, language_code, referred_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (telegram_id) DO UPDATE
       SET username = EXCLUDED.username, first_name = EXCLUDED.first_name
     RETURNING (xmax = 0) AS is_new`,
    [id, username || null, first_name || null, language_code || 'en', referredBy || null]
  );
  return result.rows[0].is_new;
}

const REFERRAL_BONUS_USD = 1;

async function creditReferralBonus(referrerTelegramId, newUserTelegramId) {
  // idempotent: one bonus per referred user, enforced by unique session id below
  await creditDeposit(referrerTelegramId, REFERRAL_BONUS_USD, `referral:${newUserTelegramId}`);
}

module.exports = { pool, initDb, upsertUser, getBalance, creditDeposit, creditReferralBonus };
