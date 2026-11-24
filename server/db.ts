import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'betkenya254.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    has_deposited INTEGER NOT NULL DEFAULT 0,
    promo_code TEXT,
    total_bonus REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('DEPOSIT', 'WITHDRAWAL', 'BONUS')),
    method TEXT NOT NULL,
    phone_or_ref TEXT NOT NULL,
    amount REAL NOT NULL,
    reference TEXT NOT NULL,
    status TEXT NOT NULL,
    merchant_request_id TEXT,
    checkout_request_id TEXT UNIQUE,
    result_desc TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_code TEXT UNIQUE NOT NULL,
    crash_point REAL NOT NULL,
    server_seed TEXT NOT NULL,
    server_seed_hash TEXT NOT NULL,
    client_seed TEXT NOT NULL,
    started_at TEXT NOT NULL,
    crashed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bets (
    id TEXT PRIMARY KEY,
    round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    panel INTEGER NOT NULL CHECK(panel IN (1, 2)),
    stake REAL NOT NULL,
    auto_cashout REAL,
    cashout_multiplier REAL,
    payout REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK(status IN ('CASHED_OUT', 'LOST')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    user_name TEXT NOT NULL,
    message TEXT NOT NULL,
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_bets_payout ON bets(payout DESC);
  CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at DESC);
`);

// Safely migrate users table for promo_code and total_bonus
const userCols = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
const userColNames = new Set(userCols.map((c) => c.name));
if (!userColNames.has('promo_code')) {
  db.exec(`ALTER TABLE users ADD COLUMN promo_code TEXT;`);
}
if (!userColNames.has('total_bonus')) {
  db.exec(`ALTER TABLE users ADD COLUMN total_bonus REAL NOT NULL DEFAULT 0;`);
}

// Safely migrate transactions table if columns or 'BONUS' type check were not present
const txSchema = db
  .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'`)
  .get() as { sql: string } | undefined;

if (txSchema && !txSchema.sql.includes("'BONUS'")) {
  db.pragma('foreign_keys = OFF');
  const migrateTx = db.transaction(() => {
    db.exec(`
      CREATE TABLE transactions_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK(type IN ('DEPOSIT', 'WITHDRAWAL', 'BONUS')),
        method TEXT NOT NULL,
        phone_or_ref TEXT NOT NULL,
        amount REAL NOT NULL,
        reference TEXT NOT NULL,
        status TEXT NOT NULL,
        merchant_request_id TEXT,
        checkout_request_id TEXT UNIQUE,
        result_desc TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      );
      INSERT INTO transactions_new (
        id, user_id, type, method, phone_or_ref, amount, reference, status,
        merchant_request_id, checkout_request_id, result_desc, created_at, updated_at
      )
      SELECT
        id, user_id, type, method, phone_or_ref, amount, reference, status,
        merchant_request_id, checkout_request_id, result_desc, created_at, updated_at
      FROM transactions;
      DROP TABLE transactions;
      ALTER TABLE transactions_new RENAME TO transactions;
      CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at DESC);
    `);
  });
  migrateTx();
  db.pragma('foreign_keys = ON');
} else {
  const txColumns = db.prepare(`PRAGMA table_info(transactions)`).all() as Array<{ name: string }>;
  const colNames = new Set(txColumns.map((c) => c.name));
  if (!colNames.has('merchant_request_id')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN merchant_request_id TEXT;`);
  }
  if (!colNames.has('checkout_request_id')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN checkout_request_id TEXT;`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_checkout_req ON transactions(checkout_request_id);`);
  }
  if (!colNames.has('result_desc')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN result_desc TEXT;`);
  }
  if (!colNames.has('updated_at')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN updated_at TEXT;`);
  }
}

export interface UserRow {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  password_hash: string;
  balance: number;
  has_deposited: number;
  promo_code: string | null;
  total_bonus: number;
  created_at: string;
}

export interface TransactionRow {
  id: string;
  user_id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'BONUS';
  method: string;
  phone_or_ref: string;
  amount: number;
  reference: string;
  status: string;
  merchant_request_id: string | null;
  checkout_request_id: string | null;
  result_desc: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface RoundRow {
  id: number;
  round_code: string;
  crash_point: number;
  server_seed: string;
  server_seed_hash: string;
  client_seed: string;
  started_at: string;
  crashed_at: string;
}

export interface BetRow {
  id: string;
  round_id: number;
  user_id: string;
  user_name: string;
  panel: 1 | 2;
  stake: number;
  auto_cashout: number | null;
  cashout_multiplier: number | null;
  payout: number;
  status: 'CASHED_OUT' | 'LOST';
  created_at: string;
}

export interface ChatMessageRow {
  id: string;
  user_id: string | null;
  user_name: string;
  message: string;
  is_system: number;
  created_at: string;
}

export function toPublicUser(user: UserRow) {
  return {
    id: user.id,
    fullName: user.full_name,
    phone: user.phone,
    email: user.email,
    balance: Math.round(user.balance * 100) / 100,
    hasDeposited: user.has_deposited === 1,
    hasDoubleBonusPromo: Boolean(user.promo_code),
    totalBonus: Math.round((user.total_bonus || 0) * 100) / 100,
    createdAt: user.created_at,
  };
}
