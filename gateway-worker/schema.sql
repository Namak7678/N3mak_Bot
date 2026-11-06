CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT UNIQUE NOT NULL,
  key_prefix TEXT,
  plan TEXT NOT NULL,
  membership_id TEXT,
  telegram_id TEXT,
  label TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  expires_at TEXT,
  nudged_at TEXT,
  limit_hit_at TEXT,
  key_plain TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_keys_membership ON api_keys(membership_id) WHERE membership_id IS NOT NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_keys_trial_telegram ON api_keys(telegram_id) WHERE plan = 'trial' AND telegram_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS usage_counters (k TEXT PRIMARY KEY, n INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS fulfillments (membership_id TEXT PRIMARY KEY, key_id TEXT, plan_id TEXT, webhook_id TEXT, event TEXT, created_at TEXT NOT NULL);
