import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { config } from '../config.js';
import {
  HttpError,
  addMinutes,
  isStrongEnough,
  maskEmail,
  nowIso,
  randomToken,
  wrap,
} from '../lib/util.js';
import { rateLimit } from '../lib/ratelimit.js';
import { emailConfigured, sendOtpEmail } from '../services/email.js';
import {
  createUserNotification,
  issueOtp,
  otpDevCode,
  requireAuth,
  revokeAllSessions,
  verifyOtpCode,
} from '../services/auth.js';
import {
  confirmTotpSetup,
  getSecurity,
  setTwoFactorMethod,
  startTotpSetup,
  twoFactorSummary,
  verifyTotp,
} from '../services/security.js';

const router = express.Router();
const securityLimiter = rateLimit({ windowMs: 10 * 60_000, max: 40, keyPrefix: 'security' });

router.get('/security', requireAuth, wrap(async (req, res) => {
  res.json(twoFactorSummary(req.user));
}));

router.post('/security/email', requireAuth, securityLimiter, wrap(async (req, res) => {
  setTwoFactorMethod(req.user.id, 'email');
  res.json({
    ...twoFactorSummary(req.user),
    message: 'Email verification is now your two-factor method. A code is required on new devices and locations.',
  });
}));

router.post('/security/totp/setup', requireAuth, securityLimiter, wrap(async (req, res) => {
  const setup = startTotpSetup(req.user.id, req.user.email);
  res.json({
    ...setup,
    message: 'Add this key to your authenticator app, then enter the 6-digit code to confirm.',
  });
}));

router.post('/security/totp/verify', requireAuth, securityLimiter, wrap(async (req, res) => {
  confirmTotpSetup(req.user.id, req.body?.code);
  createUserNotification(
    req.user.id,
    'Two-factor authentication updated',
    'Your account now requires a code from your authenticator app on every sign-in.',
  );
  res.json({
    ...twoFactorSummary(req.user),
    message: 'Authenticator app enabled. You will need it on every sign-in.',
  });
}));

router.post('/password/request', requireAuth, securityLimiter, wrap(async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!bcrypt.compareSync(currentPassword, req.user.password_hash)) {
    throw new HttpError(401, 'Your current password is not correct.');
  }
  if (!isStrongEnough(newPassword)) {
    throw new HttpError(400, 'Your new password must be at least 8 characters and include letters and numbers.');
  }
  if (currentPassword === newPassword) {
    throw new HttpError(400, 'Choose a password you have not used before.');
  }
  const newHash = bcrypt.hashSync(newPassword, 12);

  if (req.user.role === 'admin') {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
    revokeAllSessions(req.user.id);
    return res.json({
      changed: true,
      message: 'Admin password changed. Sign in again with your new password.',
      signedOut: true,
    });
  }

  const security = getSecurity(req.user.id);
  const method = security.totp_confirmed_at && security.twofa_method === 'authenticator' ? 'authenticator' : 'email';
  const requestId = randomToken(18);
  db.prepare(`INSERT INTO password_change_requests (id, user_id, new_password_hash, method, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(requestId, req.user.id, newHash, method, addMinutes(config.otpTtlMinutes), nowIso());

  if (method === 'authenticator') {
    return res.json({
      otpRequired: true,
      requestId,
      twoFactorMethod: 'authenticator',
      message: 'Enter the current 6-digit code from your authenticator app to confirm the change.',
    });
  }

  const code = issueOtp(req.user.id, 'password');
  await sendOtpEmail({ to: req.user.email, name: req.user.first_name, code: code.code, purpose: 'password' });
  res.json({
    otpRequired: true,
    requestId,
    twoFactorMethod: 'email',
    maskedEmail: maskEmail(req.user.email),
    emailDelivery: emailConfigured ? 'email' : 'console',
    devCode: otpDevCode(code.code),
    message: `A confirmation code was sent to ${maskEmail(req.user.email)}.`,
  });
}));

router.post('/password/verify', requireAuth, securityLimiter, wrap(async (req, res) => {
  const requestId = String(req.body?.requestId || '');
  const request = db.prepare('SELECT * FROM password_change_requests WHERE id = ? AND user_id = ?')
    .get(requestId, req.user.id);
  if (!request || request.consumed_at) throw new HttpError(400, 'This password change request has expired. Start again.');
  if (new Date(request.expires_at) < new Date()) throw new HttpError(400, 'This password change request has expired. Start again.');

  if (request.method === 'authenticator') {
    const security = getSecurity(req.user.id);
    if (!verifyTotp(security.totp_secret, req.body?.code)) throw new HttpError(400, 'Incorrect authenticator code.');
  } else {
    verifyOtpCode(req.user.id, 'password', req.body?.code);
  }

  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(request.new_password_hash, req.user.id);
    db.prepare('UPDATE password_change_requests SET consumed_at = ? WHERE id = ?').run(nowIso(), request.id);
    db.prepare(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?`)
      .run(nowIso(), req.user.id, req.session.id);
    createUserNotification(
      req.user.id,
      'Password changed',
      'Your KaziLink password was changed. Other devices have been signed out.',
    );
  })();

  res.json({
    changed: true,
    message: 'Password changed. Your other devices have been signed out.',
  });
}));

export default router;
