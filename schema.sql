-- RM UPI QR — Cloudflare D1 schema
-- Apply with:
--   wrangler d1 execute rm_upi_qr_db --remote --file=./schema.sql   (production)
--   wrangler d1 execute rm_upi_qr_db --local  --file=./schema.sql   (local dev)

CREATE TABLE IF NOT EXISTS transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  amount      REAL    NOT NULL CHECK (amount > 0),
  upi_id      TEXT    NOT NULL,
  bank_label  TEXT    NOT NULL,                 -- "below_2000" or "at_or_above_2000" — no bank/account names are ever stored
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'ignore')),
  created_at  TEXT    NOT NULL,                 -- ISO-8601 UTC timestamp, e.g. 2026-09-24T10:42:11.000Z
  txn_date    TEXT    NOT NULL,                 -- IST calendar date bucket, YYYY-MM-DD
  txn_time    TEXT    NOT NULL                  -- IST clock time for display, HH:MM
);

-- Fast lookups for the history page (grouping by day, filtering by status)
CREATE INDEX IF NOT EXISTS idx_transactions_txn_date ON transactions (txn_date);
CREATE INDEX IF NOT EXISTS idx_transactions_status   ON transactions (status);
CREATE INDEX IF NOT EXISTS idx_transactions_date_status ON transactions (txn_date, status);
