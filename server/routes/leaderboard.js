import express from 'express';
import crypto from 'node:crypto';
import { db, debitWallet, ensureWallet } from '../db.js';
import { config } from '../config.js';
import { HttpError, nowIso, todayKey, wrap } from '../lib/util.js';
import { createUserNotification, requireActive, requireAuth } from '../services/auth.js';
import { sendPaymentReceipt } from '../services/email.js';

const router = express.Router();

function monthKey(date = new Date()) {
  return todayKey(date).slice(0, 7);
}

function previousMonth(period) {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function standings(period) {
  return db.prepare(`SELECT w.user_id, SUM(w.amount_cents) AS total_cents, COUNT(*) AS withdrawals,
      u.username, u.first_name, u.last_name, u.public_id
    FROM withdrawals w JOIN users u ON u.id = w.user_id
    WHERE w.status = 'approved' AND to_char(w.created_at::timestamptz AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM') = ?
    GROUP BY w.user_id, u.username, u.first_name, u.last_name, u.public_id
    ORDER BY total_cents DESC, withdrawals DESC, w.user_id ASC`).all(period);
}

function publicStanding(row, index) {
  const name = `${row.first_name} ${row.last_name}`.trim();
  return {
    rank: index + 1,
    username: row.username,
    name: name || `@${row.username}`,
    publicId: row.public_id,
    totalCents: row.total_cents,
    withdrawals: row.withdrawals,
  };
}

function voucherCode() {
  return `KZ-V-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

router.get('/', requireAuth, wrap(async (req, res) => {
  const period = monthKey();
  const lastPeriod = previousMonth(period);
  const rows = standings(period);
  const lastRows = standings(lastPeriod);
  const meIndex = rows.findIndex((row) => row.user_id === req.user.id);
  const lastWinner = lastRows[0] || null;
  const existingVoucher = lastWinner
    ? db.prepare('SELECT * FROM vouchers WHERE user_id = ? AND period = ?').get(lastWinner.user_id, lastPeriod)
    : null;
  const wallet = ensureWallet(req.user.id);

  res.json({
    period,
    lastPeriod,
    top: rows.slice(0, 10).map(publicStanding),
    me: meIndex === -1
      ? { rank: null, totalCents: 0, withdrawals: 0 }
      : publicStanding(rows[meIndex], meIndex),
    totalWithdrawnCents: rows.reduce((sum, row) => sum + row.total_cents, 0),
    prize: {
      voucherCents: config.leaderboard.voucherCents,
      claimFeeCents: config.leaderboard.claimFeeCents,
      description: `The member with the highest approved withdrawals by the end of the month receives a KSh ${(config.leaderboard.voucherCents / 100).toLocaleString()} coupon voucher. Claiming the voucher requires a KSh ${(config.leaderboard.claimFeeCents / 100).toLocaleString()} activation payment.`,
    },
    previousWinner: lastWinner ? {
      ...publicStanding(lastWinner, 0),
      voucherClaimed: Boolean(existingVoucher),
    } : null,
    canClaim: Boolean(lastWinner && lastWinner.user_id === req.user.id && !existingVoucher && req.user.status === 'active'),
    walletBalanceCents: wallet.balance_cents,
    myVoucher: existingVoucher ? {
      code: existingVoucher.code,
      amountCents: existingVoucher.amount_cents,
      status: existingVoucher.status,
      expiresAt: existingVoucher.expires_at,
    } : null,
  });
}));

router.post('/claim', requireActive, wrap(async (req, res) => {
  const period = monthKey();
  const lastPeriod = previousMonth(period);
  const lastRows = standings(lastPeriod);
  const winner = lastRows[0];
  if (!winner || winner.user_id !== req.user.id) {
    throw new HttpError(403, 'Only the top withdrawer of the previous month can claim the voucher.');
  }
  const existing = db.prepare('SELECT id FROM vouchers WHERE user_id = ? AND period = ?').get(req.user.id, lastPeriod);
  if (existing) throw new HttpError(409, 'You have already claimed this month’s voucher.');

  const wallet = ensureWallet(req.user.id);
  if (wallet.balance_cents < config.leaderboard.claimFeeCents) {
    throw new HttpError(400, `You need at least KSh ${(config.leaderboard.claimFeeCents / 100).toLocaleString()} in your wallet to activate the voucher.`);
  }

  const code = voucherCode();
  const expiresAt = new Date(Date.now() + 86_400_000 * 90).toISOString();
  db.transaction(() => {
    debitWallet(
      req.user.id,
      config.leaderboard.claimFeeCents,
      'voucher_activation',
      `Voucher activation fee for ${lastPeriod} leaderboard prize`,
      { period: lastPeriod, voucherCode: code },
    );
    db.prepare(`INSERT INTO vouchers (user_id, code, amount_cents, fee_cents, period, status, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`)
      .run(req.user.id, code, config.leaderboard.voucherCents, config.leaderboard.claimFeeCents, lastPeriod, nowIso(), expiresAt);
    createUserNotification(
      req.user.id,
      'Leaderboard voucher issued',
      `You topped the ${lastPeriod} withdrawal leaderboard. Your KSh ${(config.leaderboard.voucherCents / 100).toLocaleString()} voucher code is ${code}.`,
      '/app/leaderboard',
    );
  })();

  sendPaymentReceipt({
    to: req.user.email,
    name: req.user.first_name,
    title: 'Leaderboard voucher activated',
    amountCents: config.leaderboard.voucherCents,
    reference: code,
    detail: `Your KSh ${(config.leaderboard.claimFeeCents / 100).toLocaleString()} activation fee was deducted from your wallet. The voucher is valid until ${new Date(expiresAt).toLocaleDateString('en-KE')}.`,
  }).catch(() => {});

  res.status(201).json({
    voucher: {
      code,
      amountCents: config.leaderboard.voucherCents,
      feeCents: config.leaderboard.claimFeeCents,
      expiresAt,
    },
    message: `Voucher activated. Your code is ${code}.`,
    balanceCents: ensureWallet(req.user.id).balance_cents,
  });
}));

export default router;
