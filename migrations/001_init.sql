-- 001_init.sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  btc_balance REAL NOT NULL DEFAULT 0,
  ngn_balance REAL NOT NULL DEFAULT 0,
  total_btc_earned REAL NOT NULL DEFAULT 0,
  total_ngn_earned REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  id TEXT PRIMARY KEY,
  btc_to_ngn REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'config',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reward_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  external_txn_id TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL,
  btc_amount REAL NOT NULL,
  ngn_amount REAL NOT NULL,
  exchange_rate REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'verified',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount REAL NOT NULL,
  fiat_amount REAL NOT NULL DEFAULT 0,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ngn_amount REAL NOT NULL,
  btc_amount REAL NOT NULL,
  wallet_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  provider_reference TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  UNIQUE(user_id, wallet_address, ngn_amount, created_at),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_reward_events_user_id ON reward_events(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_id ON withdrawal_requests(user_id);

INSERT INTO exchange_rates(id, btc_to_ngn, source, updated_at)
SELECT 'default', 8500000, 'config', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM exchange_rates);
