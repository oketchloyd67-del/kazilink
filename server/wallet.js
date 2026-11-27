import { db } from './db.js';
import { config } from './config.js';

export async function getWallet(userId) {
  const row = await db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);
  if (!row) return { user_id: userId, balance_cents: 0, lifetime_earned_cents: 0, updated_at: null };
  return row;
}

export async function ensureWallet(userId) {
  const existing = await getWallet(userId);
  if (existing?.user_id) return existing;
  // Use ON CONFLICT DO NOTHING - if wallet already exists (race condition), we'll read it
  await db.prepare('INSERT INTO wallets (user_id, balance_cents, lifetime_earned_cents, updated_at) VALUES (?, 0, 0, ?) ON CONFLICT (user_id) DO NOTHING')
    .run(userId, new Date().toISOString());
  return getWallet(userId);
}

export const creditWallet = (async (userId, amountCents, category, description, meta = null, counterpartyId = null, status = 'completed') => {
  await ensureWallet(userId);
  await db.prepare('INSERT INTO transactions (user_id, direction, category, amount_cents, status, description, meta, counterparty_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, 'credit', category, amountCents, status, description, meta ? JSON.stringify(meta) : null, counterpartyId, new Date().toISOString());
  if (status === 'completed') {
    await db.prepare('UPDATE wallets SET balance_cents = balance_cents + ?, lifetime_earned_cents = lifetime_earned_cents + ?, updated_at = ? WHERE user_id = ?')
      .run(amountCents, amountCents, new Date().toISOString(), userId);
  }
});

export const debitWallet = async (userId, amountCents, category, description, meta = null, counterpartyId = null, status = 'completed') => {
  await ensureWallet(userId);
  const now = new Date().toISOString();
  
  // Insert the transaction first (we need to record the intent)
  await db.prepare('INSERT INTO transactions (user_id, direction, category, amount_cents, status, description, meta, counterparty_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, 'debit', category, amountCents, status, description, meta ? JSON.stringify(meta) : null, counterpartyId, now);
  
  // Use a single UPDATE with WHERE clause to prevent race conditions
  // Returns 0 affected rows if balance is insufficient (atomic operation)
  const result = await db.prepare('UPDATE wallets SET balance_cents = balance_cents - ?, updated_at = ? WHERE user_id = ? AND balance_cents >= ?')
    .run(amountCents, now, userId, amountCents);
  
  if (result.changes === 0) {
    // Rollback the transaction insert by marking it as failed
    await db.prepare('UPDATE transactions SET status = ? WHERE id = (SELECT MAX(id) FROM transactions WHERE user_id = ? AND category = ? AND status = ?)')
      .run('failed', userId, category, status);
    const err = new Error('Insufficient balance');
    err.status = 400;
    throw err;
  }
};

export function earnedByCategory(userId, category) {
  return db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS total FROM transactions
    WHERE user_id = ? AND direction = 'credit' AND category = ? AND status = 'completed'`).get(userId, category).then((row) => Number(row.total));
}

export function withdrawalsByBucket(userId, bucket) {
  return db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS total FROM withdrawals
    WHERE user_id = ? AND bucket = ? AND status IN ('pending','approved')`).get(userId, bucket).then((row) => Number(row.total));
}

export function withdrawalsToday(userId, bucket) {
  return db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS total FROM withdrawals
    WHERE user_id = ? AND bucket = ? AND status IN ('pending','approved')
      AND substr(created_at,1,10) = ?`).get(userId, bucket, new Date().toISOString().slice(0, 10)).then((row) => Number(row.total));
}
