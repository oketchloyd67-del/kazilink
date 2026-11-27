import express from 'express';
import bcrypt from 'bcryptjs';
import { db, ensureWallet } from '../db.js';
import { config } from '../config.js';
import {
  HttpError,
  addMinutes,
  isStrongEnough,
  makePublicId,
  maskEmail,
  normalizePhone,
  nowIso,
  otpHash,
  sixDigitCode,
  wrap,
} from '../lib/util.js';
import { rateLimit } from '../lib/ratelimit.js';
import { getSecurity } from '../services/security.js';
import {
  attachUser,
  clearSessionCookie,
  createLoginChallenge,
  createSession,
  createUserNotification,
  deviceNeedsOtp,
  otpDevCode,
  publicUser,
  registerKnownDevice,
  requireAuth,
  revokeAllSessions,
  revokeSession,
  sendLoginOtp,
  setSessionCookie,
  verifyLoginChallenge,
} from '../services/auth.js';

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-7291', 12);

const authLimiter = rateLimit({ windowMs: 10 * 60_000, max: 30, keyPrefix: 'auth' });
const otpLimiter = rateLimit({ windowMs: 10 * 60_000, max: 40, keyPrefix: 'otp' });

function timeGreeting() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi', hour: '2-digit', hour12: false,
  }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function loginPayload(user) {
  return {
    user: publicUser(user),
    needsActivation: user.status !== 'active',
    greeting: `${timeGreeting()}, @${user.username}`,
  };
}

router.post('/signup', authLimiter, wrap(async (req, res) => {
  const {
    firstName, lastName, email, username, phone, password, confirmPassword, deviceId, ref,
  } = req.body || {};

  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim();
  if (first.length < 2 || first.length > 40 || !/^[a-zA-Z][a-zA-Z' -]*$/.test(first)) {
    throw new HttpError(400, 'Enter a valid first name.');
  }
  if (last.length < 2 || last.length > 40 || !/^[a-zA-Z][a-zA-Z' -]*$/.test(last)) {
    throw new HttpError(400, 'Enter a valid last name.');
  }

  const mail = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(mail) || mail.length > 120) throw new HttpError(400, 'Enter a valid email address.');

  const uname = String(username || '').trim();
  if (!USERNAME_RE.test(uname)) {
    throw new HttpError(400, 'Username must be 3–20 characters using letters, numbers or underscores.');
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) throw new HttpError(400, 'Enter a valid Kenyan phone number, e.g. 0712 345 678.');

  if (password !== confirmPassword) throw new HttpError(400, 'Passwords do not match.');
  if (!isStrongEnough(password)) {
    throw new HttpError(400, 'Password must be at least 8 characters and include both letters and numbers.');
  }

  if (db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(mail)) {
    throw new HttpError(409, 'An account with this email already exists.');
  }
  if (db.prepare('SELECT id FROM users WHERE lower(username) = ?').get(uname.toLowerCase())) {
    throw new HttpError(409, 'That username is already taken.');
  }
  if (db.prepare('SELECT id FROM users WHERE phone = ?').get(normalizedPhone)) {
    throw new HttpError(409, 'That phone number is already registered.');
  }

  let referredBy = null;
  if (ref) {
    const referrer = db.prepare('SELECT id FROM users WHERE public_id = ? AND role = ?').get(String(ref).trim(), 'user');
    if (referrer) referredBy = referrer.id;
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  let publicId = makePublicId();
  while (db.prepare('SELECT 1 FROM users WHERE public_id = ?').get(publicId)) publicId = makePublicId();

  const created = db.prepare(`INSERT INTO users
    (public_id, email, username, password_hash, first_name, last_name, phone, role, status, referred_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'user', 'inactive', ?, ?)`)
    .run(publicId, mail, uname, passwordHash, first, last, normalizedPhone, referredBy, nowIso());

  const userId = Number(created.lastInsertRowid);
  ensureWallet(userId);
  createUserNotification(
    userId,
    `${timeGreeting()}, @${uname}`,
    'Your KaziLink account has been created. Activate it to unlock videos, affiliate marketing, status tasks, Sudoku and the training academy.',
  );

  const dev = String(deviceId || '').slice(0, 100) || 'unknown';
  registerKnownDevice(userId, dev, req);
  setSessionCookie(res, createSession(userId, req, dev));

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.status(201).json({
    ...loginPayload(user),
    message: 'Account created. Activate your account to start earning.',
  });
}));

router.post('/login', authLimiter, wrap(async (req, res) => {
  const { email, password, deviceId } = req.body || {};
  const identifier = String(email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ? OR lower(username) = ?')
    .get(identifier, identifier);

  const valid = bcrypt.compareSync(String(password || ''), user?.password_hash || DUMMY_HASH);
  if (!user || !valid) throw new HttpError(401, 'Invalid email or password.');
  if (user.status === 'suspended') throw new HttpError(403, 'This account is suspended. Use the in-app support form for help.');

  const dev = String(deviceId || '').slice(0, 100);
  if (!dev) throw new HttpError(400, 'Missing device identifier. Refresh the page and try again.');

  const security = getSecurity(user.id);
  const authenticatorRequired = Boolean(security.totp_confirmed_at && security.twofa_method === 'authenticator');
  const check = authenticatorRequired
    ? { required: true, reason: 'two_factor' }
    : deviceNeedsOtp(user, dev, req);
  if (check.required) {
    const challenge = createLoginChallenge(user, dev, req, check.reason);
    if (challenge.method === 'authenticator') {
      return res.json({
        otpRequired: true,
        challengeId: challenge.challengeId,
        twoFactorMethod: 'authenticator',
        reason: check.reason,
        message: 'Enter the 6-digit code from your authenticator app to finish signing in.',
      });
    }
    await sendLoginOtp({ user, challengeId: challenge.challengeId, code: challenge.code });
    return res.json({
      otpRequired: true,
      challengeId: challenge.challengeId,
      twoFactorMethod: 'email',
      maskedEmail: maskEmail(user.email),
      reason: check.reason,
      message: check.reason === 'new_location'
        ? 'We noticed a sign-in from a new location. Enter the code we emailed you.'
        : 'We noticed a sign-in from a new device. Enter the code we emailed you.',
      devCode: otpDevCode(challenge.code),
    });
  }

  registerKnownDevice(user.id, dev, req);
  setSessionCookie(res, createSession(user.id, req, dev));
  res.json(loginPayload(user));
}));

router.post('/login/otp', otpLimiter, wrap(async (req, res) => {
  const { challengeId, code } = req.body || {};
  if (!challengeId) throw new HttpError(400, 'Missing sign-in challenge.');
  const { user, deviceId } = verifyLoginChallenge(String(challengeId), code);
  if (user.status === 'suspended') throw new HttpError(403, 'This account is suspended. Use the in-app support form for help.');
  registerKnownDevice(user.id, deviceId, req);
  setSessionCookie(res, createSession(user.id, req, deviceId));
  res.json(loginPayload(user));
}));

router.post('/login/resend', otpLimiter, wrap(async (req, res) => {
  const challengeId = String(req.body?.challengeId || '');
  const challenge = db.prepare('SELECT * FROM login_challenges WHERE id = ?').get(challengeId);
  if (!challenge || challenge.consumed_at) throw new HttpError(400, 'This sign-in attempt has expired. Please log in again.');
  if (new Date(challenge.expires_at) < new Date()) throw new HttpError(400, 'This sign-in attempt has expired. Please log in again.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(challenge.user_id);
  if (challenge.method === 'authenticator') {
    throw new HttpError(400, 'Your authenticator app generates a new code automatically. Open it and enter the current code.');
  }
  const code = sixDigitCode();
  db.prepare('UPDATE login_challenges SET code_hash = ?, expires_at = ?, attempts = 0 WHERE id = ?')
    .run(otpHash(code, user.id), addMinutes(config.otpTtlMinutes), challengeId);
  await sendLoginOtp({ user, challengeId, code });
  res.json({ message: `A new code was sent to ${maskEmail(user.email)}.`, devCode: otpDevCode(code) });
}));

router.post('/logout', wrap(async (req, res) => {
  revokeSession(req.cookies?.[config.cookieName]);
  clearSessionCookie(res);
  res.json({ ok: true });
}));

router.post('/logout-all', requireAuth, wrap(async (req, res) => {
  revokeAllSessions(req.user.id);
  clearSessionCookie(res);
  res.json({ ok: true });
}));

router.get('/me', wrap(async (req, res) => {
  // attachUser already runs for all /api routes via index.js middleware
  if (!req.user) return res.status(401).json({ user: null });
  res.json({ user: publicUser(req.user) });
}));

router.post('/heartbeat', requireAuth, wrap(async (req, res) => {
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), req.session.id);
  res.json({ ok: true, idleTimeoutMinutes: config.idleTimeoutMinutes });
}));

router.post('/admin/login', authLimiter, wrap(async (req, res) => {
  const { email, password, deviceId } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ? AND role = ?')
    .get(String(email || '').trim().toLowerCase(), 'admin');
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    throw new HttpError(401, 'Invalid credentials.');
  }
  const dev = String(deviceId || 'admin-console').slice(0, 100);
  setSessionCookie(res, createSession(user.id, req, dev));
  res.json({ user: publicUser(user), admin: true, greeting: `${timeGreeting()}, @${user.username}` });
}));

export default router;
