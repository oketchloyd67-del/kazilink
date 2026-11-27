import express from 'express';
import { db, creditWallet, ensureWallet } from '../db.js';
import { HttpError, nowIso, wrap } from '../lib/util.js';
import { createUserNotification, publicUser, requireAdmin, revokeAllSessions } from '../services/auth.js';
import { sendActivationNoticeEmail, sendMail, sendWithdrawalEmail } from '../services/email.js';

const router = express.Router();
router.use(requireAdmin);

function userSummary(row) {
  return {
    id: row.id,
    publicId: row.public_id,
    firstName: row.first_name,
    lastName: row.last_name,
    username: row.username,
    email: row.email,
    phone: row.phone,
    status: row.status,
    role: row.role,
    balanceCents: row.balance_cents || 0,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
    referrals: row.referrals || 0,
  };
}

router.get('/stats', wrap(async (_req, res) => {
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const totalUsers = one(`SELECT COUNT(*) AS c FROM users WHERE role = 'user'`).c;
  const activeUsers = one(`SELECT COUNT(*) AS c FROM users WHERE role = 'user' AND status = 'active'`).c;
  const inactiveUsers = one(`SELECT COUNT(*) AS c FROM users WHERE role = 'user' AND status = 'inactive'`).c;
  const pendingWithdrawals = one(`SELECT COUNT(*) AS c, COALESCE(SUM(amount_cents),0) AS total FROM withdrawals WHERE status = 'pending'`);
  const pendingTasks = one(`SELECT COUNT(*) AS c FROM task_submissions WHERE status = 'pending'`).c;
  const pendingStatus = one(`SELECT COUNT(*) AS c FROM status_submissions WHERE status = 'pending'`).c;
  const revenue = one(`SELECT COALESCE(SUM(amount_cents),0) AS total FROM payments WHERE status = 'paid' AND purpose = 'activation'`).total;
  const gameRevenue = one(`SELECT COALESCE(SUM(amount_cents),0) AS total FROM payments WHERE status = 'paid' AND purpose = 'sudoku'`).total;
  const paidOut = one(`SELECT COALESCE(SUM(amount_cents),0) AS total FROM withdrawals WHERE status = 'approved'`).total;
  const balances = one(`SELECT COALESCE(SUM(balance_cents),0) AS total FROM wallets`).total;
  const enrollments = one(`SELECT COUNT(*) AS c FROM training_enrollments WHERE status = 'active'`).c;
  const openSupport = one(`SELECT COUNT(*) AS c FROM support_messages WHERE status = 'open'`).c;
  const trainingRevenue = one(`SELECT COALESCE(SUM(amount_cents),0) AS total FROM course_payments WHERE status = 'paid'`).total;

  res.json({
    users: { total: totalUsers, active: activeUsers, inactive: inactiveUsers },
    pending: {
      withdrawals: pendingWithdrawals.c,
      withdrawalCents: pendingWithdrawals.total,
      taskSubmissions: pendingTasks,
      statusSubmissions: pendingStatus,
    },
    money: {
      activationRevenueCents: revenue,
      sudokuRevenueCents: gameRevenue,
      paidOutCents: paidOut,
      customerBalancesCents: balances,
      trainingRevenueCents: trainingRevenue,
    },
    activity: {
      activeEnrollments: enrollments,
      openSupport,
    },
    admin: publicUser(_req.user),
  });
}));

router.get('/users', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const status = String(req.query.status || 'all');
  const params = [];
  let where = `WHERE u.role = 'user'`;
  if (q) {
    where += ` AND (lower(u.email) LIKE ? OR lower(u.username) LIKE ? OR lower(u.first_name) LIKE ?
      OR lower(u.last_name) LIKE ? OR u.public_id LIKE ? OR u.phone LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }
  if (['inactive', 'active', 'suspended'].includes(status)) {
    where += ' AND u.status = ?';
    params.push(status);
  }
  const rows = db.prepare(`SELECT u.*, w.balance_cents,
      (SELECT COUNT(*) FROM users r WHERE r.referred_by = u.id) AS referrals
    FROM users u LEFT JOIN wallets w ON w.user_id = u.id ${where}
    ORDER BY u.id DESC LIMIT 100`).all(...params);
  res.json({ users: rows.map(userSummary) });
}));

router.post('/users/notify-inactive', wrap(async (req, res) => {
  const hours = Math.min(72, Math.max(1, Number.parseInt(req.body?.hours || '24', 10) || 24));
  const rows = db.prepare("SELECT id, email, first_name, username FROM users WHERE role = 'user' AND status = 'inactive'").all();
  for (const user of rows) {
    createUserNotification(
      user.id,
      'Activate your account within 24 hours',
      `Hi @${user.username}, your account is still inactive. Activate within ${hours} hours to prevent deletion of your account.`,
      '/app/activate',
    );
    sendActivationNoticeEmail({ to: user.email, name: user.first_name, hours }).catch(() => {});
  }
  res.json({ notified: rows.length, message: `${rows.length} inactive member${rows.length === 1 ? '' : 's'} notified.` });
}));

router.delete('/users/:id', wrap(async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!user) throw new HttpError(404, 'User not found.');
  if (user.role !== 'user') throw new HttpError(403, 'Admin accounts cannot be deleted from here.');
  
  // Delete in a transaction to handle foreign key constraints
  db.transaction(() => {
    // Clear referred_by references first
    db.prepare('UPDATE users SET referred_by = NULL WHERE referred_by = ?').run(user.id);
    
    // Clear transactions where this user is the counterparty
    db.prepare('UPDATE transactions SET counterparty_id = NULL WHERE counterparty_id = ?').run(user.id);
    
    // Clear other foreign key references
    db.prepare('UPDATE withdrawals SET reviewed_by = NULL WHERE reviewed_by = ?').run(user.id);
    db.prepare('UPDATE support_messages SET replied_by = NULL WHERE replied_by = ?').run(user.id);
    db.prepare('UPDATE task_submissions SET reviewed_by = NULL WHERE reviewed_by = ?').run(user.id);
    db.prepare('UPDATE status_submissions SET reviewed_by = NULL WHERE reviewed_by = ?').run(user.id);
    
    // Now safe to delete the user
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  })();
  
  res.json({ ok: true, message: `Account @${user.username} was deleted.` });
}));

router.get('/users/:id', wrap(async (req, res) => {
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!user) throw new HttpError(404, 'User not found.');
  const wallet = await ensureWallet(user.id);
  const transactions = await db.prepare(`SELECT id, direction, category, amount_cents, status, description, created_at
    FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 30`).all(user.id);
  const withdrawals = await db.prepare(`SELECT id, bucket, amount_cents, phone, status, created_at FROM withdrawals
    WHERE user_id = ? ORDER BY id DESC LIMIT 20`).all(user.id);
  const taskCountRow = await db.prepare('SELECT COUNT(*) AS c FROM task_submissions WHERE user_id = ?').get(user.id);
  const taskCount = Number(taskCountRow?.c) || 0;
  const statusCountRow = await db.prepare('SELECT COUNT(*) AS c FROM status_submissions WHERE user_id = ?').get(user.id);
  const statusCount = Number(statusCountRow?.c) || 0;
  const gamesRow = await db.prepare('SELECT COUNT(*) AS c FROM sudoku_games WHERE user_id = ?').get(user.id);
  const games = Number(gamesRow?.c) || 0;
  const referrer = user.referred_by ? await db.prepare('SELECT public_id, username FROM users WHERE id = ?').get(user.referred_by) : null;
  res.json({
    user: { ...publicUser(user), balanceCents: wallet.balance_cents, lifetimeEarnedCents: wallet.lifetime_earned_cents, referrer },
    transactions,
    withdrawals,
    activity: { taskSubmissions: taskCount, statusSubmissions: statusCount, sudokuGames: games },
  });
}));

router.post('/users/:id/action', wrap(async (req, res) => {
  const user = await db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(Number(req.params.id), 'user');
  if (!user) throw new HttpError(404, 'User not found.');
  const action = String(req.body?.action || '');
  if (action === 'activate') {
    await db.prepare(`UPDATE users SET status = 'active', activated_at = COALESCE(activated_at, ?) WHERE id = ?`)
      .run(nowIso(), user.id);
    await createUserNotification(user.id, 'Account activated', 'An administrator activated your account. All features are unlocked.');
  } else if (action === 'suspend') {
    await db.prepare(`UPDATE users SET status = 'suspended' WHERE id = ?`).run(user.id);
    await revokeAllSessions(user.id);
    await createUserNotification(user.id, 'Account suspended', 'Your account has been suspended. Use the in-app support form for help.');
  } else if (action === 'reinstate') {
    await db.prepare(`UPDATE users SET status = 'inactive' WHERE id = ?`).run(user.id);
    await createUserNotification(user.id, 'Account reinstated', 'Your account is available again. Activate it to continue earning.');
  } else if (action === 'logout') {
    revokeAllSessions(user.id);
  } else {
    throw new HttpError(400, 'Unknown action.');
  }
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json({ user: publicUser(updated), message: 'User updated.' });
}));

router.get('/withdrawals', wrap(async (req, res) => {
  const status = String(req.query.status || 'pending');
  const where = ['pending', 'approved', 'rejected'].includes(status) ? 'WHERE w.status = ?' : '';
  const rows = db.prepare(`SELECT w.*, u.public_id, u.username, u.first_name, u.last_name, u.email, u.status AS user_status
    FROM withdrawals w JOIN users u ON u.id = w.user_id ${where} ORDER BY w.id DESC LIMIT 100`)
    .all(...(where ? [status] : []));
  res.json({ withdrawals: rows });
}));

router.post('/withdrawals/:id/review', wrap(async (req, res) => {
  const withdrawal = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(Number(req.params.id));
  if (!withdrawal) throw new HttpError(404, 'Withdrawal not found.');
  if (withdrawal.status !== 'pending') throw new HttpError(409, 'This withdrawal was already reviewed.');
  const action = String(req.body?.action || '');
  const note = String(req.body?.note || '').slice(0, 300);
  if (!['approve', 'reject'].includes(action)) throw new HttpError(400, 'Choose approve or cancel.');
  if (action === 'reject' && note.trim().length < 3) throw new HttpError(400, 'Give the member a reason for cancelling this withdrawal.');

  db.transaction(() => {
    const tx = db.prepare(`SELECT * FROM transactions WHERE user_id = ? AND category = 'withdrawal'
      AND json_extract(meta, '$.withdrawalId') = ?`).get(withdrawal.user_id, withdrawal.id);

    if (action === 'approve') {
      db.prepare(`UPDATE withdrawals SET status = 'approved', admin_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`)
        .run(note || null, req.user.id, nowIso(), withdrawal.id);
      if (tx) db.prepare(`UPDATE transactions SET status = 'completed' WHERE id = ?`).run(tx.id);
      createUserNotification(
        withdrawal.user_id,
        'Withdrawal approved',
        `Your withdrawal of KSh ${(withdrawal.amount_cents / 100).toFixed(2)} was approved and is on its way to ${withdrawal.method === 'crypto' ? withdrawal.crypto_address : withdrawal.phone}.`,
        '/app/wallet',
      );
    } else {
      db.prepare(`UPDATE withdrawals SET status = 'rejected', admin_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`)
        .run(note || 'Rejected by admin', req.user.id, nowIso(), withdrawal.id);
      if (tx) db.prepare(`UPDATE transactions SET status = 'rejected' WHERE id = ?`).run(tx.id);
      ensureWallet(withdrawal.user_id);
      db.prepare('UPDATE wallets SET balance_cents = balance_cents + ?, updated_at = ? WHERE user_id = ?')
        .run(withdrawal.amount_cents, nowIso(), withdrawal.user_id);
      db.prepare(`INSERT INTO transactions (user_id, direction, category, amount_cents, status, description, meta, created_at)
        VALUES (?, 'credit', 'withdrawal_refund', ?, 'completed', ?, ?, ?)`)
        .run(withdrawal.user_id, withdrawal.amount_cents, `Refund for rejected withdrawal #${withdrawal.id}`, JSON.stringify({ withdrawalId: withdrawal.id }), nowIso());
      createUserNotification(
        withdrawal.user_id,
        'Withdrawal cancelled',
        `Your withdrawal request #${withdrawal.id} was cancelled${note ? `: ${note}` : ''}. The funds were returned to your balance.`,
        '/app/wallet',
      );
    }
  })();

  const member = db.prepare('SELECT email, first_name FROM users WHERE id = ?').get(withdrawal.user_id);
  if (member) {
    sendWithdrawalEmail({
      to: member.email,
      name: member.first_name,
      title: action === 'approve' ? 'Withdrawal approved' : 'Withdrawal request cancelled',
      amountCents: withdrawal.amount_cents,
      phone: withdrawal.method === 'crypto' ? withdrawal.crypto_address : withdrawal.phone,
      status: action === 'approve' ? 'Approved and paid' : 'Cancelled — funds returned to your balance',
      note,
    }).catch(() => {});
  }

  res.json({ ok: true, message: `Withdrawal ${action === 'approve' ? 'approved' : 'cancelled'}.` });
}));

router.get('/submissions', wrap(async (req, res) => {
  const type = String(req.query.type || 'tasks');
  const status = String(req.query.status || 'pending');
  const statusWhere = ['pending', 'approved', 'rejected'].includes(status) ? status : 'pending';

  if (type === 'status') {
    const rows = db.prepare(`SELECT ss.*, u.public_id, u.username, u.first_name, u.last_name, p.name AS product_name
      FROM status_submissions ss JOIN users u ON u.id = ss.user_id JOIN products p ON p.id = ss.product_id
      WHERE ss.status = ? ORDER BY ss.id ASC LIMIT 100`).all(statusWhere);
    return res.json({ type: 'status', submissions: rows });
  }
  const rows = db.prepare(`SELECT ts.*, u.public_id, u.username, u.first_name, u.last_name,
      c.name AS creator_name, c.handle AS creator_handle, v.title AS video_title
    FROM task_submissions ts JOIN users u ON u.id = ts.user_id
    JOIN creators c ON c.id = ts.creator_id JOIN videos v ON v.id = ts.video_id
    WHERE ts.status = ? ORDER BY ts.id ASC LIMIT 100`).all(statusWhere);
  res.json({ type: 'tasks', submissions: rows });
}));

router.post('/submissions/tasks/:id/review', wrap(async (req, res) => {
  const sub = db.prepare('SELECT * FROM task_submissions WHERE id = ?').get(Number(req.params.id));
  if (!sub) throw new HttpError(404, 'Submission not found.');
  if (sub.status !== 'pending') throw new HttpError(409, 'This submission was already reviewed.');
  const action = String(req.body?.action || '');
  if (!['approve', 'reject'].includes(action)) throw new HttpError(400, 'Choose approve or reject.');
  const note = String(req.body?.note || '').slice(0, 300);
  if (action === 'reject' && note.trim().length < 3) throw new HttpError(400, 'Give the member a reason for rejecting this submission.');

  db.transaction(() => {
    db.prepare(`UPDATE task_submissions SET status = ?, admin_note = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?`)
      .run(action === 'approve' ? 'approved' : 'rejected', note || null, nowIso(), req.user.id, sub.id);
    if (action === 'approve') {
      creditWallet(sub.user_id, sub.amount_cents, 'video_task', `Creator ${sub.task_type} task verified`, { submissionId: sub.id });
    }
    createUserNotification(
      sub.user_id,
      action === 'approve' ? 'Task approved' : 'Task evidence rejected',
      action === 'approve'
        ? `Your ${sub.task_type} evidence was verified. KSh ${(sub.amount_cents / 100).toFixed(2)} was added to your balance.`
        : `Your ${sub.task_type} submission was rejected${note ? `: ${note}` : ''}.`,
    );
  })();

  res.json({ ok: true, message: `Submission ${action === 'approve' ? 'approved' : 'rejected'}.` });
}));

router.post('/submissions/status/:id/review', wrap(async (req, res) => {
  const sub = db.prepare('SELECT * FROM status_submissions WHERE id = ?').get(Number(req.params.id));
  if (!sub) throw new HttpError(404, 'Submission not found.');
  if (sub.status !== 'pending') throw new HttpError(409, 'This submission was already reviewed.');
  const action = String(req.body?.action || '');
  if (!['approve', 'reject'].includes(action)) throw new HttpError(400, 'Choose approve or reject.');
  const note = String(req.body?.note || '').slice(0, 300);
  if (action === 'reject' && note.trim().length < 3) throw new HttpError(400, 'Give the member a reason for rejecting this submission.');

  db.transaction(() => {
    db.prepare(`UPDATE status_submissions SET status = ?, admin_note = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?`)
      .run(action === 'approve' ? 'approved' : 'rejected', note || null, nowIso(), req.user.id, sub.id);
    if (action === 'approve') {
      creditWallet(sub.user_id, sub.amount_cents, 'status', `WhatsApp status verified (${sub.viewers} viewers)`, { submissionId: sub.id });
    }
    createUserNotification(
      sub.user_id,
      action === 'approve' ? 'Status task approved' : 'Status evidence rejected',
      action === 'approve'
        ? `Your status screenshot was verified. KSh ${(sub.amount_cents / 100).toFixed(2)} was added to your balance.`
        : `Your status submission was rejected${note ? `: ${note}` : ''}.`,
    );
  })();

  res.json({ ok: true, message: `Submission ${action === 'approve' ? 'approved' : 'rejected'}.` });
}));

router.get('/payments', wrap(async (_req, res) => {
  const rows = db.prepare(`SELECT p.id, p.purpose, p.amount_cents, p.phone, p.status, p.provider, p.provider_ref,
      p.created_at, p.paid_at, u.public_id, u.username
    FROM payments p JOIN users u ON u.id = p.user_id ORDER BY p.id DESC LIMIT 100`).all();
  res.json({ payments: rows });
}));

router.get('/sudoku', wrap(async (_req, res) => {
  const rows = db.prepare(`SELECT g.id, g.status, g.fee_cents, g.payout_cents, g.day, g.started_at, g.submitted_at,
      u.username, u.public_id
    FROM sudoku_games g JOIN users u ON u.id = g.user_id ORDER BY g.id DESC LIMIT 100`).all();
  res.json({ games: rows });
}));

router.get('/training', wrap(async (req, res) => {
  const status = String(req.query.status || 'all');
  const where = ['active', 'pending', 'expired', 'cancelled'].includes(status) ? 'WHERE e.status = ?' : '';
  const rows = db.prepare(`SELECT e.*, u.public_id, u.username, u.first_name, u.last_name, u.email,
      c.title AS course_title, c.slug AS course_slug, c.price_cents
    FROM training_enrollments e JOIN users u ON u.id = e.user_id JOIN training_courses c ON c.id = e.course_id
    ${where} ORDER BY e.id DESC LIMIT 100`).all(...(where ? [status] : []));
  const payments = db.prepare(`SELECT p.id, p.amount_cents, p.status, p.created_at, p.paid_at, u.username, c.title
    FROM course_payments p JOIN users u ON u.id = p.user_id JOIN training_courses c ON c.id = p.course_id
    ORDER BY p.id DESC LIMIT 50`).all();
  res.json({ enrollments: rows, payments });
}));

router.post('/training/:id/cancel', wrap(async (req, res) => {
  const enrollment = db.prepare('SELECT * FROM training_enrollments WHERE id = ?').get(Number(req.params.id));
  if (!enrollment) throw new HttpError(404, 'Enrollment not found.');
  if (enrollment.status === 'cancelled') throw new HttpError(409, 'This enrollment was already cancelled.');
  const reason = String(req.body?.reason || 'Cancelled by admin').slice(0, 300);
  db.prepare(`UPDATE training_enrollments SET status = 'cancelled', cancelled_at = ?, cancelled_reason = ?, updated_at = ? WHERE id = ?`)
    .run(nowIso(), reason, nowIso(), enrollment.id);
  createUserNotification(
    enrollment.user_id,
    'Training enrollment cancelled',
    `Your training enrollment was cancelled: ${reason}`,
    '/app/training',
  );
  res.json({ ok: true, message: 'Enrollment cancelled.' });
}));

router.delete('/training/:id', wrap(async (req, res) => {
  const enrollment = db.prepare('SELECT * FROM training_enrollments WHERE id = ?').get(Number(req.params.id));
  if (!enrollment) throw new HttpError(404, 'Enrollment not found.');
  db.prepare('DELETE FROM training_enrollments WHERE id = ?').run(enrollment.id);
  res.json({ ok: true, message: 'Enrollment record deleted.' });
}));

router.get('/support', wrap(async (req, res) => {
  const status = String(req.query.status || 'open');
  const where = ['open', 'replied', 'resolved'].includes(status) ? 'WHERE s.status = ?' : '';
  const rows = db.prepare(`SELECT s.*, u.public_id, u.username, u.first_name, u.last_name, u.email, u.status AS user_status
    FROM support_messages s JOIN users u ON u.id = s.user_id ${where} ORDER BY s.id DESC LIMIT 100`)
    .all(...(where ? [status] : []));
  res.json({ messages: rows });
}));

router.post('/support/:id/reply', wrap(async (req, res) => {
  const ticket = db.prepare('SELECT * FROM support_messages WHERE id = ?').get(Number(req.params.id));
  if (!ticket) throw new HttpError(404, 'Support request not found.');
  const reply = String(req.body?.reply || '').trim();
  if (reply.length < 2 || reply.length > 2000) throw new HttpError(400, 'Write a reply between 2 and 2,000 characters.');
  db.prepare(`UPDATE support_messages SET status = 'replied', admin_reply = ?, replied_by = ?, replied_at = ? WHERE id = ?`)
    .run(reply, req.user.id, nowIso(), ticket.id);
  const member = db.prepare('SELECT email, first_name FROM users WHERE id = ?').get(ticket.user_id);
  createUserNotification(ticket.user_id, 'Reply from KaziLink support', reply, '/app');
  if (member) {
    sendMail({
      to: member.email,
      subject: 'Reply from KaziLink support',
      text: `Hi ${member.first_name},\n\n${reply}\n\nYour request: ${ticket.message}\n\nKaziLink`,
      html: `<div style="font-family:Inter,Arial,sans-serif;padding:24px;color:#1b1630"><p>Hi ${member.first_name},</p><p>${reply}</p><p style="color:#7a7390;margin-top:20px">Your request: ${ticket.message}</p></div>`,
    }).catch(() => {});
  }
  res.json({ ok: true, message: 'Reply sent to the member.' });
}));

router.post('/support/:id/resolve', wrap(async (req, res) => {
  const ticket = db.prepare('SELECT * FROM support_messages WHERE id = ?').get(Number(req.params.id));
  if (!ticket) throw new HttpError(404, 'Support request not found.');
  db.prepare("UPDATE support_messages SET status = 'resolved' WHERE id = ?").run(ticket.id);
  res.json({ ok: true, message: 'Request marked resolved.' });
}));

router.delete('/support/:id', wrap(async (req, res) => {
  const ticket = db.prepare('SELECT id FROM support_messages WHERE id = ?').get(Number(req.params.id));
  if (!ticket) throw new HttpError(404, 'Support request not found.');
  db.prepare('DELETE FROM support_messages WHERE id = ?').run(ticket.id);
  res.json({ ok: true, message: 'Support request deleted.' });
}));

router.get('/vouchers', wrap(async (_req, res) => {
  const rows = db.prepare(`SELECT v.*, u.username, u.first_name, u.last_name, u.email
    FROM vouchers v JOIN users u ON u.id = v.user_id ORDER BY v.id DESC LIMIT 100`).all();
  res.json({ vouchers: rows });
}));

router.put('/settings/tuma', wrap(async (req, res) => {
  const baseUrl = String(req.body?.baseUrl || '').trim();
  const apiKey = String(req.body?.apiKey || '').trim();
  const accountId = String(req.body?.accountId || '').trim();
  
  if (baseUrl && (!apiKey || !accountId)) {
    throw new HttpError(400, 'API key and account ID are required when setting a base URL.');
  }
  if (!baseUrl && (apiKey || accountId)) {
    throw new HttpError(400, 'Clear the base URL to remove API key and account ID.');
  }
  
  // Save to app_settings
  if (baseUrl) {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('tuma_base_url', baseUrl);
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('tuma_api_key', apiKey);
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('tuma_account_id', accountId);
  } else {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run('tuma_base_url');
    db.prepare('DELETE FROM app_settings WHERE key = ?').run('tuma_api_key');
    db.prepare('DELETE FROM app_settings WHERE key = ?').run('tuma_account_id');
  }
  
  res.json({ ok: true, message: 'Tuma settings updated.' });
}));

router.get('/settings/tuma', wrap(async (_req, res) => {
  const baseUrl = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('tuma_base_url')?.value || '';
  const accountId = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('tuma_account_id')?.value || '';
  // Don't return the API key for security
  res.json({ baseUrl, accountId });
}));

export default router;
