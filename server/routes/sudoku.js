import express from 'express';
import { db, creditWallet } from '../db.js';
import {
  SUDOKU_FEE_CENTS,
  SUDOKU_GAMES_PER_DAY,
  SUDOKU_SECONDS,
  SUDOKU_WIN_MULTIPLIER,
  WITHDRAW_BUCKETS,
} from '../config.js';
import { HttpError, nowIso, todayKey, wrap } from '../lib/util.js';
import { getSettingInt } from '../lib/settings.js';
import { requireActive } from '../services/auth.js';
import { confirmCollection, initiateCollection } from '../services/tuma.js';
import { createSudoku } from '../lib/sudoku.js';
import { sendPaymentReceipt } from '../services/email.js';
import { bucketSummary } from './wallet.js';

const router = express.Router();

const puzzleRows = (game) => game.puzzle.split('').map((n) => Number(n));

async function expireStaleGames(userId) {
  const now = new Date().toISOString();
  const stale = await db.prepare(`SELECT id FROM sudoku_games WHERE user_id = ? AND status = 'playing' AND expires_at < ?`)
    .all(userId, now);
  for (const g of stale) {
    await db.prepare(`UPDATE sudoku_games SET status = 'lost' WHERE id = ?`).run(g.id);
  }
}

router.get('/', requireActive, wrap(async (req, res) => {
  expireStaleGames(req.user.id);
  const day = todayKey();
  const usedRow = await db.prepare('SELECT COUNT(*) AS c FROM sudoku_games WHERE user_id = ? AND day = ?').get(req.user.id, day);
  const used = Number(usedRow?.c) || 0;
  const active = await db.prepare(`SELECT * FROM sudoku_games WHERE user_id = ? AND status = 'playing' ORDER BY id DESC LIMIT 1`)
    .get(req.user.id);
  const history = await db.prepare(`SELECT id, status, fee_cents, payout_cents, started_at, submitted_at, created_at
    FROM sudoku_games WHERE user_id = ? AND status IN ('won','lost') ORDER BY id DESC LIMIT 10`).all(req.user.id);
  const bucket = (await bucketSummary(req.user.id)).find((b) => b.key === 'sudoku');
  const feeCents = await getSettingInt('sudoku_fee_cents', SUDOKU_FEE_CENTS);

  res.json({
    feeCents,
    winMultiplier: SUDOKU_WIN_MULTIPLIER,
    seconds: SUDOKU_SECONDS,
    gamesPerDay: SUDOKU_GAMES_PER_DAY,
    gamesUsed: used,
    gamesLeft: Math.max(0, SUDOKU_GAMES_PER_DAY - used),
    activeGame: active ? {
      id: active.id,
      puzzle: puzzleRows(active),
      startedAt: active.started_at,
      expiresAt: active.expires_at,
      serverTime: nowIso(),
    } : null,
    history,
    withdrawableCents: bucket?.availableCents || 0,
    withdrawal: {
      minCents: WITHDRAW_BUCKETS.sudoku.minCents,
      maxCents: WITHDRAW_BUCKETS.sudoku.maxCents,
    },
  });
}));

router.post('/pay', requireActive, wrap(async (req, res) => {
  expireStaleGames(req.user.id);
  const day = todayKey();
  const usedRow = await db.prepare('SELECT COUNT(*) AS c FROM sudoku_games WHERE user_id = ? AND day = ?').get(req.user.id, day);
  const used = Number(usedRow?.c) || 0;
  if (used >= SUDOKU_GAMES_PER_DAY) {
    throw new HttpError(429, 'You have used all 3 Sudoku games for today. Come back tomorrow.');
  }
  const pin = String(req.body?.pin || '');
  if (!/^\d{4}$/.test(pin)) throw new HttpError(400, 'Enter your 4-digit M-Pesa PIN to pay the entry fee.');
  const feeCents = getSettingInt('sudoku_fee_cents', SUDOKU_FEE_CENTS);
  const phone = req.user.phone;

    const payment = await db.prepare(`INSERT INTO payments (user_id, purpose, amount_cents, phone, provider, status, created_at)
    VALUES (?, 'sudoku', ?, ?, 'tuma', 'pending', ?)`).run(req.user.id, feeCents, phone, nowIso());
  const paymentId = Number(payment.lastInsertRowid);

  try {
    const initiated = await initiateCollection({
      amountCents: feeCents,
      phone,
      reference: `sudoku-${req.user.public_id}-${paymentId}`,
      purpose: 'sudoku',
    });

    await db.prepare('UPDATE payments SET provider_ref = ?, meta = ? WHERE id = ?')
      .run(initiated.providerRef, JSON.stringify({ sandbox: initiated.sandbox }), paymentId);
    const confirmed = await confirmCollection({ providerRef: initiated.providerRef, pin });
    if (confirmed.status !== 'paid') {
      await db.prepare(`UPDATE payments SET status = 'failed' WHERE id = ?`).run(paymentId);
      throw new HttpError(402, 'Payment was not completed. The board was not opened.');
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    await db.prepare(`UPDATE payments SET status = 'failed' WHERE id = ?`).run(paymentId);
    throw new HttpError(502, 'We could not confirm the entry payment. Please try again.');
  }

  await db.prepare(`UPDATE payments SET status = 'paid', paid_at = ? WHERE id = ?`).run(nowIso(), paymentId);
  const { puzzle, solution } = createSudoku(38);
  const started = new Date();
  const expires = new Date(started.getTime() + SUDOKU_SECONDS * 1000);
  const created = await db.prepare(`INSERT INTO sudoku_games
    (user_id, day, puzzle, solution, status, fee_cents, payment_id, started_at, expires_at, created_at)
    VALUES (?, ?, ?, ?, 'playing', ?, ?, ?, ?, ?)`)
    .run(req.user.id, day, puzzle, solution, feeCents, paymentId, started.toISOString(), expires.toISOString(), started.toISOString());

  sendPaymentReceipt({
    to: req.user.email,
    name: req.user.first_name,
    title: 'Sudoku entry payment received',
    amountCents: feeCents,
    reference: `SUD-${paymentId}`,
    detail: 'Your game board is open. Complete the grid within 60 seconds to win triple your entry.',
  }).catch(() => {});

  res.status(201).json({
    game: {
      id: Number(created.lastInsertRowid),
      puzzle: puzzleRows({ puzzle }),
      startedAt: started.toISOString(),
      expiresAt: expires.toISOString(),
      serverTime: new Date().toISOString(),
      seconds: SUDOKU_SECONDS,
    },
    feeCents,
    payoutCents: feeCents * SUDOKU_WIN_MULTIPLIER,
    gamesLeft: Math.max(0, SUDOKU_GAMES_PER_DAY - used - 1),
    message: 'Payment confirmed. You have 60 seconds — fill the grid.',
  });
}));

router.post('/:id/submit', requireActive, wrap(async (req, res) => {
  const game = await db.prepare('SELECT * FROM sudoku_games WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), req.user.id);
  if (!game) throw new HttpError(404, 'Game not found.');
  if (game.status !== 'playing') throw new HttpError(409, 'This game is already finished.');

  const raw = String(req.body?.solution || '').replace(/[^1-9]/g, '');
  if (raw.length !== 81) throw new HttpError(400, 'Complete the whole grid before submitting.');

  if (new Date(game.expires_at).getTime() < Date.now()) {
    await db.prepare(`UPDATE sudoku_games SET status = 'lost', submitted_at = ? WHERE id = ?`).run(nowIso(), game.id);
    return res.json({
      won: false,
      expired: true,
      solution: game.solution.split('').map(Number),
      message: 'Time is up. This game was lost — no payout this round.',
    });
  }

  const won = raw === game.solution;
  const payout = won ? game.fee_cents * SUDOKU_WIN_MULTIPLIER : 0;

  await db.transaction(() => {
    db.prepare(`UPDATE sudoku_games SET status = ?, payout_cents = ?, submitted_at = ? WHERE id = ?`)
      .run(won ? 'won' : 'lost', payout, nowIso(), game.id);
    if (won) {
      creditWallet(req.user.id, payout, 'sudoku', 'Sudoku win — 3× entry fee', { gameId: game.id });
      db.prepare('INSERT INTO notifications (user_id, title, body, created_at) VALUES (?, ?, ?, ?)')
        .run(req.user.id, 'Sudoku win', `You beat the clock and earned KSh ${(payout / 100).toFixed(2)}.`, nowIso());
    }
  })();

  res.json({
    won,
    payoutCents: payout,
    solution: game.solution.split('').map(Number),
    message: won
      ? `You won! KSh ${(payout / 100).toFixed(2)} was added to your Sudoku balance.`
      : 'Not quite this time. No payout for this game.',
  });
}));

router.get('/history', requireActive, wrap(async (req, res) => {
  const rows = await db.prepare(`SELECT id, day, status, fee_cents, payout_cents, started_at, submitted_at
    FROM sudoku_games WHERE user_id = ? ORDER BY id DESC LIMIT 20`).all(req.user.id);
  res.json({ games: rows });
}));

export default router;
