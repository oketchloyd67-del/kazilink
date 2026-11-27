import express from 'express';
import { db } from '../db.js';
import { config } from '../config.js';
import {
  HttpError,
  addMinutes,
  maskEmail,
  maskPhone,
  normalizePhone,
  nowIso,
  wrap,
} from '../lib/util.js';
import { getSettingInt } from '../lib/settings.js';
import { emailConfigured, sendOtpEmail, sendPaymentReceipt } from '../services/email.js';
import { checkCollectionStatus, confirmCollection, initiateCollection } from '../services/tuma.js';
import {
  createUserNotification,
  issueOtp,
  otpDevCode,
  publicUser,
  requireAuth,
  verifyOtpCode,
  createSession,
  revokeAllSessions,
  registerKnownDevice,
} from '../services/auth.js';
import { creditWallet, debitWallet, ensureWallet } from '../wallet.js';

const router = express.Router();

function latestPayment(userId) {
  return db.prepare(`SELECT * FROM payments WHERE user_id = ? AND purpose = 'activation'
    ORDER BY id DESC LIMIT 1`).get(userId);
}

router.get('/', requireAuth, wrap(async (req, res) => {
  const feeCents = getSettingInt('activation_fee_cents', config.activationFeeCents);
  const payment = latestPayment(req.user.id);
  const pendingOtp = db.prepare(`SELECT id, expires_at FROM otp_codes WHERE user_id = ? AND purpose = 'activation'
    AND consumed_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1`).get(req.user.id, nowIso());
  res.json({
    status: req.user.status,
    feeCents,
    phone: req.user.phone,
    maskedPhone: maskPhone(req.user.phone),
    latestPayment: payment ? {
      id: payment.id,
      amountCents: payment.amount_cents,
      status: payment.status,
      phone: payment.phone,
      createdAt: payment.created_at,
    } : null,
    awaitingOtp: Boolean(pendingOtp) || (payment?.status === 'paid' && req.user.status !== 'active'),
    maskedEmail: maskEmail(req.user.email),
  });
}));

router.post('/initiate', requireAuth, wrap(async (req, res) => {
  if (req.user.status === 'active') throw new HttpError(409, 'Your account is already active.');
  const phone = normalizePhone(req.body?.phone || req.user.phone);
  if (!phone) throw new HttpError(400, 'Enter a valid M-Pesa phone number.');

  const feeCents = getSettingInt('activation_fee_cents', config.activationFeeCents);
  db.prepare(`UPDATE payments SET status = 'cancelled' WHERE user_id = ? AND purpose = 'activation' AND status = 'pending'`)
    .run(req.user.id);

  const created = db.prepare(`INSERT INTO payments (user_id, purpose, amount_cents, phone, provider, status, created_at)
    VALUES (?, 'activation', ?, ?, 'tuma', 'pending', ?)`)
    .run(req.user.id, feeCents, phone, nowIso());
  const paymentId = Number(created.lastInsertRowid);

  try {
    const collection = await initiateCollection({
      amountCents: feeCents,
      phone,
      reference: `activation-${req.user.public_id}-${paymentId}`,
      purpose: 'activation',
    });
    db.prepare('UPDATE payments SET provider_ref = ?, status = ?, meta = ? WHERE id = ?')
      .run(collection.providerRef, 'pending', JSON.stringify({ sandbox: collection.sandbox }), paymentId);
  } catch (error) {
    db.prepare(`UPDATE payments SET status = 'failed', meta = ? WHERE id = ?`)
      .run(JSON.stringify({ error: error.message }), paymentId);
    throw new HttpError(502, 'We could not reach the payment service. Please try again in a moment.');
  }

  res.status(201).json({
    paymentId,
    amountCents: feeCents,
    phone,
    maskedPhone: maskPhone(phone),
    message: 'Confirm the number, then enter your M-Pesa PIN to complete the payment.',
  });
}));

router.get('/payment/:id', requireAuth, wrap(async (req, res) => {
  const payment = db.prepare(`SELECT * FROM payments WHERE id = ? AND user_id = ? AND purpose = 'activation'`)
    .get(Number(req.params.id), req.user.id);
  if (!payment) throw new HttpError(404, 'Payment not found.');

  if (payment.status === 'pending') {
    let status;
    try {
      status = await checkCollectionStatus(payment.provider_ref);
    } catch {
      return res.json({ status: 'pending', message: 'Still waiting for M-Pesa to respond.' });
    }
    if (status.status === 'paid') {
      db.prepare(`UPDATE payments SET status = 'paid', paid_at = ? WHERE id = ?`).run(nowIso(), payment.id);
      payment.status = 'paid';
    } else if (status.status === 'failed') {
      db.prepare(`UPDATE payments SET status = 'failed' WHERE id = ?`).run(payment.id);
      return res.json({ status: 'failed', message: 'The payment was not completed. You can try again.' });
    } else {
      return res.json({ status: 'pending', message: 'Still waiting for you to approve the M-Pesa request.' });
    }
  }

  if (payment.status === 'paid') {
    if (req.user.status === 'active') {
      return res.json({ status: 'paid', active: true, user: publicUser(req.user) });
    }
    const pending = db.prepare(`SELECT id FROM otp_codes WHERE user_id = ? AND purpose = 'activation'
      AND consumed_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1`).get(req.user.id, nowIso());
    let code = null;
    if (!pending) {
      code = issueOtp(req.user.id, 'activation');
      await sendOtpEmail({ to: req.user.email, name: req.user.first_name, code: code.code, purpose: 'activation' });
    }
    return res.json({
      status: 'paid',
      otpRequired: true,
      maskedEmail: maskEmail(req.user.email),
      message: 'Payment received. Enter the 6-digit code we emailed you to activate your account.',
      devCode: code ? otpDevCode(code.code) : undefined,
      emailDelivery: emailConfigured ? 'email' : 'console',
    });
  }

  res.json({ status: payment.status, message: 'This payment was not completed. Start a new payment.' });
}));

router.post('/pay', requireAuth, wrap(async (req, res) => {
  if (req.user.status === 'active') throw new HttpError(409, 'Your account is already active.');
  const paymentId = Number(req.body?.paymentId);
  const pin = String(req.body?.pin || '');
  const payment = db.prepare(`SELECT * FROM payments WHERE id = ? AND user_id = ? AND purpose = 'activation'`)
    .get(paymentId, req.user.id);
  if (!payment) throw new HttpError(404, 'Payment not found.');
  if (payment.status === 'paid') {
    const code = issueOtp(req.user.id, 'activation');
    await sendOtpEmail({ to: req.user.email, name: req.user.first_name, code: code.code, purpose: 'activation' });
    return res.json({
      otpRequired: true,
      maskedEmail: maskEmail(req.user.email),
      message: 'Payment already received. Enter the activation code we emailed you.',
      devCode: otpDevCode(code.code),
    });
  }
  if (payment.status !== 'pending') throw new HttpError(409, 'This payment can no longer be completed. Start a new payment.');

  let result;
  try {
    result = await confirmCollection({ providerRef: payment.provider_ref, pin });
  } catch (error) {
    throw new HttpError(error.status || 502, error.message || 'Payment could not be confirmed.');
  }
  if (result.status === 'failed') {
    db.prepare(`UPDATE payments SET status = 'failed' WHERE id = ?`).run(payment.id);
    throw new HttpError(402, 'The payment was not completed. You can try again.');
  }
  if (result.status !== 'paid') {
    throw new HttpError(409, 'Payment is still pending. Check your M-Pesa messages, then try again.');
  }

  db.prepare(`UPDATE payments SET status = 'paid', paid_at = ? WHERE id = ?`).run(nowIso(), payment.id);
  const code = issueOtp(req.user.id, 'activation');
  await sendOtpEmail({ to: req.user.email, name: req.user.first_name, code: code.code, purpose: 'activation' });

  res.json({
    otpRequired: true,
    maskedEmail: maskEmail(req.user.email),
    message: `Payment received. Enter the 6-digit code sent to ${maskEmail(req.user.email)} to verify your identity.`,
    devCode: otpDevCode(code.code),
    emailDelivery: emailConfigured ? 'email' : 'console',
  });
}));

router.post('/verify', requireAuth, wrap(async (req, res) => {
  if (req.user.status === 'active') {
    return res.json({ user: publicUser(req.user), alreadyActive: true, message: 'Your account is already active.' });
  }
  const payment = db.prepare(`SELECT * FROM payments WHERE user_id = ? AND purpose = 'activation' AND status = 'paid'
    ORDER BY id DESC LIMIT 1`).get(req.user.id);
  if (!payment) throw new HttpError(400, 'Complete your activation payment first.');

  verifyOtpCode(req.user.id, 'activation', req.body?.code);

  const activatedAt = nowIso();
  db.transaction(() => {
    db.prepare(`UPDATE users SET status = 'active', activated_at = ?, activation_fee_cents = ? WHERE id = ?`)
      .run(activatedAt, payment.amount_cents, req.user.id);
    ensureWallet(req.user.id);

    if (req.user.referred_by) {
      const existing = db.prepare('SELECT id FROM affiliate_commissions WHERE payment_id = ?').get(payment.id);
      if (!existing) {
        const commission = Math.round(payment.amount_cents * (config.referralCommissionPercent / 100));
        if (commission > 0) {
          db.prepare(`INSERT INTO affiliate_commissions (referrer_id, referred_id, payment_id, amount_cents, created_at)
            VALUES (?, ?, ?, ?, ?)`).run(req.user.referred_by, req.user.id, payment.id, commission, activatedAt);
          creditWallet(
            req.user.referred_by,
            commission,
            'affiliate',
            `20% commission from ${req.user.username}'s activation`,
            { referredUserId: req.user.id, paymentId: payment.id },
            req.user.id,
          );
          createUserNotification(
            req.user.referred_by,
            'Affiliate commission earned',
            `You earned ${config.referralCommissionPercent}% commission because @${req.user.username} activated their account.`,
          );
        }
      }
    }

    createUserNotification(
      req.user.id,
      'Account activated',
      'Your account is now active. All earning features are unlocked.',
    );
  })();

  sendPaymentReceipt({
    to: req.user.email,
    name: req.user.first_name,
    title: 'Activation payment received',
    amountCents: payment.amount_cents,
    reference: `ACT-${payment.id}`,
    detail: 'Your KaziLink account is now active. Videos, creator tasks, WhatsApp status tasks, affiliate marketing, Sudoku and the Academy are unlocked.',
  }).catch(() => {});

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({
    user: publicUser(user),
    activated: true,
    message: 'Congratulations! Your account is active. All features are now unlocked.',
  });
}));

router.post('/resend', requireAuth, wrap(async (req, res) => {
  if (req.user.status === 'active') throw new HttpError(409, 'Your account is already active.');
  const payment = db.prepare(`SELECT * FROM payments WHERE user_id = ? AND purpose = 'activation' AND status = 'paid'
    ORDER BY id DESC LIMIT 1`).get(req.user.id);
  if (!payment) throw new HttpError(400, 'Complete your activation payment first.');
  const code = issueOtp(req.user.id, 'activation');
  db.prepare('UPDATE otp_codes SET expires_at = ? WHERE id = (SELECT MAX(id) FROM otp_codes WHERE user_id = ? AND purpose = ?)')
    .run(addMinutes(config.otpTtlMinutes), req.user.id, 'activation');
  await sendOtpEmail({ to: req.user.email, name: req.user.first_name, code: code.code, purpose: 'activation' });
  res.json({ message: `A new code was sent to ${maskEmail(req.user.email)}.`, devCode: otpDevCode(code.code) });
}));

export default router;
