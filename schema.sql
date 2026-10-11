CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount REAL NOT NULL CHECK (amount > 0),
  upi_id TEXT NOT NULL,
  bank_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'ignore')),
  created_at TEXT NOT NULL,
  txn_date TEXT NOT NULL,
  txn_time TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_txn_date ON transactions (txn_date);

CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);

CREATE INDEX IF NOT EXISTS idx_transactions_date_status ON transactions (txn_date, status);

CREATE TABLE IF NOT EXISTS auth_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  password_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);

INSERT OR IGNORE INTO auth_state (id, password_hash, failed_attempts, locked_until) VALUES (1, 'e80ee576f20e707770939272ca6da9734c30e841de7d81e3d45f8b1a175065e1', 0, NULL);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);
