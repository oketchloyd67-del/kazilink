import express from 'express';
import { db, ensureWallet, getWallet } from '../db.js';
import { WITHDRAW_BUCKETS, config } from '../config.js';
import { HttpError, normalizePhone, nowIso, todayKey, wrap } from '../lib/util.js';
import { createUserNotification, requireActive, requireAuth } from '../services/auth.js';
import { sendWithdrawalEmail } from '../services/email.js';
import { ensureDailyProduct, ensureDailyVideo } from '../seed.js';

const router = express.Router();

const BUCKET_CATEGORIES = {
  affiliate: ['affiliate'],
  videos: ['video', 'video_task'],
  status: ['status'],
  sudoku: ['sudoku'],
  wallet: ['p2p_in', 'bonus', 'adjustment'],
};

async function categoryEarnings(userId, categories) {
  const placeholders = categories.map(() => '?').join(',');
  const row = await db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS total FROM transactions
    WHERE user_id = ? AND direction = 'credit' AND status = 'completed' AND category IN (${placeholders})`)
    .get(userId, ...categories);
  return Number(row?.total) || 0;
}

async function bucketWithdrawn(userId, bucket) {
  const row = await db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS total FROM withdrawals
    WHERE user_id = ? AND bucket = ? AND status IN ('pending','approved')`).get(userId, bucket);
  return Number(row?.total) || 0;
}

async function bucketWithdrawnToday(userId, bucket) {
  const row = await db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS total FROM withdrawals
    WHERE user_id = ? AND bucket = ? AND status IN ('pending','approved')
      AND date(created_at, '+3 hours') = ?`).get(userId, bucket, todayKey());
  return Number(row?.total) || 0;
}

export async function bucketSummary(userId) {
  const wallet = await ensureWallet(userId);
  const summary = [];
  for (const [key, rules] of Object.entries(WITHDRAW_BUCKETS)) {
    const earned = await categoryEarnings(userId, BUCKET_CATEGORIES[key]);
    const withdrawn = await bucketWithdrawn(userId, key);
    const withdrawnToday = await bucketWithdrawnToday(userId, key);
    const activityAvailable = Math.max(0, earned - withdrawn);
    summary.push({
      key,
      label: rules.label,
      minCents: rules.minCents,
      maxCents: rules.maxCents,
      earnedCents: earned,
      withdrawnCents: withdrawn,
      availableCents: Math.min(activityAvailable, wallet.balance_cents),
      remainingTodayCents: Math.max(0, rules.maxCents - withdrawnToday),
      canWithdraw: Math.min(activityAvailable, wallet.balance_cents) >= rules.minCents
        && withdrawnToday < rules.maxCents,
    });
  }
  return summary;
}

router.get('/dashboard', requireAuth, wrap(async (req, res) => {
  const userId = req.user.id;
  const wallet = await ensureWallet(userId);
  const day = todayKey();
  await ensureDailyVideo(day);
  await ensureDailyProduct(day);

  const pendingWithdrawals = (await db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS total, COUNT(*) AS count
    FROM withdrawals WHERE user_id = ? AND status = 'pending'`).get(userId)) || { total: 0, count: 0 };
  const transactions = await db.prepare(`SELECT id, direction, category, amount_cents, status, description, created_at
    FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 8`).all(userId);
  const withdrawals = await db.prepare(`SELECT id, bucket, amount_cents, phone, status, admin_note, created_at
    FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 6`).all(userId);

  const todayVideo = await db.prepare(`SELECT v.id, v.title, v.duration_seconds FROM daily_videos dv
    JOIN videos v ON v.id = dv.video_id WHERE dv.day = ?`).get(day);
  const watch = todayVideo
    ? await db.prepare('SELECT watched_seconds, payout_cents, status FROM watch_sessions WHERE user_id = ? AND video_id = ?')
      .get(userId, todayVideo.id)
    : null;

  const gamesTodayRow = await db.prepare(`SELECT COUNT(*) AS c FROM sudoku_games WHERE user_id = ? AND day = ?`).get(userId, day);
  const gamesToday = Number(gamesTodayRow?.c) || 0;
  const referralsRow = await db.prepare('SELECT COUNT(*) AS c FROM users WHERE referred_by = ?').get(userId);
  const referrals = Number(referralsRow?.c) || 0;
  const activeReferralsRow = await db.prepare(`SELECT COUNT(*) AS c FROM users WHERE referred_by = ? AND status = 'active'`).get(userId);
  const activeReferrals = Number(activeReferralsRow?.c) || 0;
  const commissionRow = await db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS total FROM affiliate_commissions WHERE referrer_id = ?`).get(userId);
  const commission = Number(commissionRow?.total) || 0;
  const approvedTasksRow = await db.prepare(`SELECT COUNT(*) AS c FROM task_submissions WHERE user_id = ? AND status = 'approved'`).get(userId);
  const approvedTasks = Number(approvedTasksRow?.c) || 0;
  const approvedStatusRow = await db.prepare(`SELECT COUNT(*) AS c FROM status_submissions WHERE user_id = ? AND status = 'approved'`).get(userId);
  const approvedStatus = Number(approvedStatusRow?.c) || 0;
  const winsRow = await db.prepare(`SELECT COUNT(*) AS c FROM sudoku_games WHERE user_id = ? AND status = 'won'`).get(userId);
  const wins = Number(winsRow?.c) || 0;

  const steps = [
    { key: 'account', label: 'Create your account', done: true },
    { key: 'activation', label: 'Activate your account', done: req.user.status === 'active' },
    { key: 'video', label: 'Watch your first video', done: Boolean(watch?.payout_cents > 0) },
    { key: 'task', label: 'Complete a creator task', done: approvedTasks > 0 },
    { key: 'status', label: 'Post a product status', done: approvedStatus > 0 },
    { key: 'affiliate', label: 'Refer your first active member', done: activeReferrals > 0 },
    { key: 'sudoku', label: 'Win a Sudoku game', done: wins > 0 },
  ];
  const completed = steps.filter((s) => s.done).length;

  const videosRow = await db.prepare(`SELECT COUNT(*) AS c FROM watch_sessions WHERE user_id = ? AND status = 'paid'`).get(userId);
  const sudokuCountRow = await db.prepare('SELECT COUNT(*) AS c FROM sudoku_games WHERE user_id = ?').get(userId);
  const activityCounts = {
    videos: Number(videosRow?.c) || 0,
    tasks: approvedTasks,
    status: approvedStatus,
    sudoku: Number(sudokuCountRow?.c) || 0,
    referrals,
  };

  res.json({
    user: {
      publicId: req.user.public_id,
      firstName: req.user.first_name,
      lastName: req.user.last_name,
      username: req.user.username,
      email: req.user.email,
      phone: req.user.phone,
      status: req.user.status,
    },
    wallet: {
      balanceCents: wallet.balance_cents,
      lifetimeEarnedCents: wallet.lifetime_earned_cents,
      pendingWithdrawalCents: pendingWithdrawals.total,
      pendingWithdrawalCount: pendingWithdrawals.count,
    },
    earnings: {
      affiliateCents: categoryEarnings(userId, BUCKET_CATEGORIES.affiliate),
      videoCents: categoryEarnings(userId, BUCKET_CATEGORIES.videos),
      statusCents: categoryEarnings(userId, BUCKET_CATEGORIES.status),
      sudokuCents: categoryEarnings(userId, BUCKET_CATEGORIES.sudoku),
      commissionCents: commission,
    },
    activityCounts,
    today: {
      videoId: todayVideo?.id || null,
      videoTitle: todayVideo?.title || null,
      videoWatchedSeconds: watch?.watched_seconds || 0,
      videoPaid: watch?.status === 'paid',
      sudokuGamesUsed: gamesToday,
      sudokuGamesLeft: Math.max(0, 3 - gamesToday),
    },
    progress: {
      completed,
      total: steps.length,
      percent: Math.round((completed / steps.length) * 100),
      steps,
    },
    transactions,
    withdrawals,
  });
}));

router.get('/wallet', requireAuth, wrap(async (req, res) => {
  const wallet = ensureWallet(req.user.id);
  const buckets = bucketSummary(req.user.id);
  const withdrawals = db.prepare(`SELECT id, bucket, amount_cents, phone, method, crypto_address, crypto_network, status, admin_note, created_at, reviewed_at
    FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 25`).all(req.user.id);
  const transactions = db.prepare(`SELECT id, direction, category, amount_cents, status, description, counterparty_id, created_at
    FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50`).all(req.user.id);
  res.json({
    balanceCents: wallet.balance_cents,
    lifetimeEarnedCents: wallet.lifetime_earned_cents,
    buckets,
    withdrawals,
    transactions,
  });
}));

router.get('/wallet/transactions', requireAuth, wrap(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || '30', 10) || 30));
  const rows = db.prepare(`SELECT id, direction, category, amount_cents, status, description, created_at
    FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?`).all(req.user.id, limit);
  res.json({ transactions: rows });
}));

router.post('/wallet/transfer', requireActive, wrap(async (req, res) => {
  const wallet = ensureWallet(req.user.id);
  const recipientCode = String(req.body?.recipient || '').trim().toUpperCase().replace(/^@/, '');
  const amountCents = Math.round(Number(req.body?.amountCents ?? Number(req.body?.amount) * 100));
  const note = String(req.body?.note || '').slice(0, 120).trim();

  if (!recipientCode) throw new HttpError(400, 'Enter the recipient’s KaziLink user ID.');
  if (!Number.isFinite(amountCents) || amountCents < 100) throw new HttpError(400, 'Minimum transfer is KSh 1.00.');

  const recipient = db.prepare('SELECT * FROM users WHERE upper(public_id) = ?').get(recipientCode);
  if (!recipient) throw new HttpError(404, 'No KaziLink member matches that user ID.');
  if (recipient.id === req.user.id) throw new HttpError(400, 'You cannot send money to yourself.');
  if (recipient.role !== 'user') throw new HttpError(400, 'That user ID cannot receive transfers.');
  if (recipient.status === 'suspended') throw new HttpError(400, 'That account cannot receive transfers right now.');
  if (wallet.balance_cents < amountCents) throw new HttpError(400, 'Your available balance is too low for this transfer.');

  db.transaction(() => {
    db.prepare('UPDATE wallets SET balance_cents = balance_cents - ?, updated_at = ? WHERE user_id = ?')
      .run(amountCents, nowIso(), req.user.id);
    db.prepare('INSERT INTO transactions (user_id, direction, category, amount_cents, status, description, meta, counterparty_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, 'debit', 'p2p_out', amountCents, 'completed', `Sent to @${recipient.username}${note ? ` — ${note}` : ''}`, JSON.stringify({ note }), recipient.id, nowIso());

    ensureWallet(recipient.id);
    db.prepare('UPDATE wallets SET balance_cents = balance_cents + ?, lifetime_earned_cents = lifetime_earned_cents + ?, updated_at = ? WHERE user_id = ?')
      .run(amountCents, amountCents, nowIso(), recipient.id);
    db.prepare('INSERT INTO transactions (user_id, direction, category, amount_cents, status, description, meta, counterparty_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(recipient.id, 'credit', 'p2p_in', amountCents, 'completed', `Received from @${req.user.username}${note ? ` — ${note}` : ''}`, JSON.stringify({ note }), req.user.id, nowIso());

    db.prepare('INSERT INTO notifications (user_id, title, body, created_at) VALUES (?, ?, ?, ?)')
      .run(recipient.id, 'Wallet transfer received', `@${req.user.username} sent you KSh ${(amountCents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}.`, nowIso());
  })();

  res.json({
    ok: true,
    message: `Sent KSh ${(amountCents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })} to ${recipient.first_name} @${recipient.username}.`,
    balanceCents: getWallet(req.user.id).balance_cents,
  });
}));

router.get('/withdrawals/options', requireActive, wrap(async (req, res) => {
  res.json({
    buckets: bucketSummary(req.user.id),
    phone: req.user.phone,
    crypto: { minCents: config.crypto.minCents, networks: config.crypto.networks },
  });
}));

router.post('/withdraw', requireActive, wrap(async (req, res) => {
  const bucketKey = String(req.body?.bucket || '');
  const rules = WITHDRAW_BUCKETS[bucketKey];
  if (!rules) throw new HttpError(400, 'Choose where your withdrawal is coming from.');
  const amountCents = Math.round(Number(req.body?.amountCents));
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new HttpError(400, 'Enter a valid withdrawal amount.');
  if (amountCents < rules.minCents) throw new HttpError(400, `Minimum withdrawal for ${rules.label.toLowerCase()} is KSh ${(rules.minCents / 100).toLocaleString()}.`);
  if (amountCents > rules.maxCents) throw new HttpError(400, `Maximum withdrawal for ${rules.label.toLowerCase()} is KSh ${(rules.maxCents / 100).toLocaleString()} per day.`);

  const phone = normalizePhone(req.body?.phone || req.user.phone);
  if (!phone) throw new HttpError(400, 'Enter a valid M-Pesa number for the payout.');

  const bucket = bucketSummary(req.user.id).find((b) => b.key === bucketKey);
  if (amountCents > bucket.availableCents) {
    throw new HttpError(400, `You can withdraw up to KSh ${(bucket.availableCents / 100).toLocaleString()} from ${rules.label.toLowerCase()} right now.`);
  }
  if (amountCents > bucket.remainingTodayCents) {
    throw new HttpError(400, `You have reached today’s ${rules.label.toLowerCase()} withdrawal limit.`);
  }

  const wallet = ensureWallet(req.user.id);
  if (wallet.balance_cents < amountCents) throw new HttpError(400, 'Insufficient balance.');

  const id = db.transaction(() => {
    const created = db.prepare(`INSERT INTO withdrawals (user_id, bucket, amount_cents, phone, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?)`).run(req.user.id, bucketKey, amountCents, phone, nowIso());
    db.prepare('UPDATE wallets SET balance_cents = balance_cents - ?, updated_at = ? WHERE user_id = ?')
      .run(amountCents, nowIso(), req.user.id);
    db.prepare(`INSERT INTO transactions (user_id, direction, category, amount_cents, status, description, meta, created_at)
      VALUES (?, 'debit', 'withdrawal', ?, 'pending', ?, ?, ?)`)
      .run(req.user.id, amountCents, `Withdrawal to ${phone} (${rules.label})`, JSON.stringify({ bucket: bucketKey, withdrawalId: created.lastInsertRowid }), nowIso());
    return Number(created.lastInsertRowid);
  })();

  createUserNotification(
    req.user.id,
    'Withdrawal request received',
    `Your request for KSh ${(amountCents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })} to ${phone} is pending admin approval.`,
    '/app/wallet',
  );
  sendWithdrawalEmail({
    to: req.user.email,
    name: req.user.first_name,
    title: 'Withdrawal request received',
    amountCents,
    phone,
    status: 'Pending admin approval',
  }).catch(() => {});

  res.status(201).json({
    withdrawal: {
      id,
      bucket: bucketKey,
      amountCents,
      phone,
      method: 'mpesa',
      status: 'pending',
    },
    message: 'Withdrawal request received. It is pending admin approval.',
  });
}));

router.post('/withdraw/crypto', requireActive, wrap(async (req, res) => {
  const amountCents = Math.round(Number(req.body?.amountCents));
  const address = String(req.body?.address || '').trim();
  const network = String(req.body?.network || '').trim();
  if (!Number.isFinite(amountCents) || amountCents < config.crypto.minCents) {
    throw new HttpError(400, `Minimum crypto withdrawal is KSh ${(config.crypto.minCents / 100).toLocaleString()}.`);
  }
  if (!config.crypto.networks.includes(network)) throw new HttpError(400, 'Choose a supported crypto network.');
  if (address.length < 20 || address.length > 120 || /\s/.test(address)) {
    throw new HttpError(400, 'Paste a valid receiving address for the selected network.');
  }

  const walletBucket = bucketSummary(req.user.id).find((b) => b.key === 'wallet');
  if (amountCents > walletBucket.remainingTodayCents) {
    throw new HttpError(400, 'You have reached today’s wallet withdrawal limit.');
  }

  const wallet = ensureWallet(req.user.id);
  if (wallet.balance_cents < amountCents) throw new HttpError(400, 'Insufficient balance for this crypto withdrawal.');

  const id = db.transaction(() => {
    const created = db.prepare(`INSERT INTO withdrawals
      (user_id, bucket, amount_cents, phone, method, crypto_address, crypto_network, status, created_at)
      VALUES (?, 'wallet', ?, ?, 'crypto', ?, ?, 'pending', ?)`)
      .run(req.user.id, amountCents, req.user.phone, address, network, nowIso());
    db.prepare('UPDATE wallets SET balance_cents = balance_cents - ?, updated_at = ? WHERE user_id = ?')
      .run(amountCents, nowIso(), req.user.id);
    db.prepare(`INSERT INTO transactions (user_id, direction, category, amount_cents, status, description, meta, created_at)
      VALUES (?, 'debit', 'withdrawal', ?, 'pending', ?, ?, ?)`)
      .run(
        req.user.id,
        amountCents,
        `Crypto withdrawal (${network}) to ${address.slice(0, 8)}…${address.slice(-6)}`,
        JSON.stringify({ withdrawalId: Number(created.lastInsertRowid), method: 'crypto', network, address }),
        nowIso(),
      );
    return Number(created.lastInsertRowid);
  })();

  createUserNotification(
    req.user.id,
    'Crypto withdrawal request received',
    `Your request for KSh ${(amountCents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })} in ${network} is pending admin approval.`,
    '/app/wallet',
  );
  sendWithdrawalEmail({
    to: req.user.email,
    name: req.user.first_name,
    title: 'Crypto withdrawal request received',
    amountCents,
    phone: `${network} · ${address.slice(0, 8)}…${address.slice(-6)}`,
    status: 'Pending admin approval',
  }).catch(() => {});

  res.status(201).json({
    withdrawal: {
      id,
      bucket: 'wallet',
      amountCents,
      method: 'crypto',
      network,
      address,
      status: 'pending',
    },
    message: 'Crypto withdrawal request received. It is pending admin approval.',
  });
}));

router.get('/affiliate', requireActive, wrap(async (req, res) => {
  const referrals = db.prepare(`SELECT u.public_id, u.username, u.first_name, u.status, u.created_at,
      (SELECT COALESCE(SUM(ac.amount_cents),0) FROM affiliate_commissions ac WHERE ac.referred_id = u.id) AS commission_cents
    FROM users u WHERE u.referred_by = ? ORDER BY u.id DESC`).all(req.user.id);
  const totals = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS total, COUNT(*) AS count
    FROM affiliate_commissions WHERE referrer_id = ?`).get(req.user.id);
  const rule = WITHDRAW_BUCKETS.affiliate;
  const bucket = bucketSummary(req.user.id).find((b) => b.key === 'affiliate');
  res.json({
    referralCode: req.user.public_id,
    referralLink: `${config.appOrigin}/signup?ref=${encodeURIComponent(req.user.public_id)}`,
    commissionPercent: config.referralCommissionPercent,
    referrals: referrals.map((r) => ({
      publicId: r.public_id,
      username: r.username,
      firstName: r.first_name,
      status: r.status,
      joinedAt: r.created_at,
      commissionCents: r.commission_cents,
    })),
    totals: { commissionCents: totals.total, activations: totals.count },
    withdrawal: { minCents: rule.minCents, maxCents: rule.maxCents, ...bucket },
  });
}));

router.get('/notifications', requireAuth, wrap(async (req, res) => {
  const rows = db.prepare(`SELECT id, title, body, read_at, created_at FROM notifications
    WHERE user_id = ? ORDER BY id DESC LIMIT 30`).all(req.user.id);
  res.json({ notifications: rows, unread: rows.filter((n) => !n.read_at).length });
}));

router.post('/notifications/read', requireAuth, wrap(async (req, res) => {
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(nowIso(), req.user.id);
  res.json({ ok: true });
}));

router.get('/features', requireAuth, wrap(async (req, res) => {
  const active = req.user.status === 'active';
  res.json({
    active,
    features: [
      { key: 'videos', label: 'Watch & earn', description: 'Daily video with creator tasks', icon: 'play' },
      { key: 'status', label: 'WhatsApp status', description: 'Share the product of the day', icon: 'share' },
      { key: 'affiliate', label: 'Affiliate marketing', description: 'Earn 20% on every activation', icon: 'users' },
      { key: 'sudoku', label: 'Sudoku challenge', description: 'Beat the clock, triple your entry', icon: 'grid' },
    ],
  });
}));

export default router;
