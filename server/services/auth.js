import crypto from 'node:crypto';
import { db, ensureWallet } from '../db.js';
import { getWallet, creditWallet, debitWallet, earnedByCategory, withdrawalsByBucket, withdrawalsToday } from '../wallet.js';
import { config } from '../config.js';
import { HttpError, addMinutes, clientIp, maskEmail, nowIso, otpHash, randomToken, sha256, sixDigitCode } from '../lib/util.js';
import { emailConfigured, sendOtpEmail } from './email.js';
import { pushToUser } from './push.js';

export function coarseLocation(ip) {
  if (!ip) return '';
  if (ip.includes(':')) return ip.split(':').slice(0, 4).join(':');
  return ip.split('.').slice(0, 3).join('.');
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    publicId: user.public_id,
    email: user.email,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    fullName: `${user.first_name} ${user.last_name}`,
    phone: user.phone,
    role: user.role,
    status: user.status,
    referredBy: user.referred_by,
    activationFeeCents: user.activation_fee_cents,
    createdAt: user.created_at,
    activatedAt: user.activated_at,
  };
}

export function setSessionCookie(res, token) {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.sessionTtlMinutes * 60_000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, { httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/' });
}

export async function createSession(userId, req, deviceId) {
  const token = randomToken(32);
  const now = new Date();
  await db.prepare(`INSERT INTO sessions (token_hash, user_id, device_id, ip, user_agent, created_at, last_seen_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      sha256(token),
      userId,
      deviceId || 'unknown',
      clientIp(req),
      req.headers['user-agent'] || '',
      now.toISOString(),
      now.toISOString(),
      addMinutes(config.sessionTtlMinutes, now),
    );
  return token;
}

export async function revokeSession(token) {
  if (!token) return;
  await db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(nowIso(), sha256(token));
}

export async function revokeAllSessions(userId) {
  await db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowIso(), userId);
}

export async function registerKnownDevice(userId, deviceId, req) {
  const now = nowIso();
  await db.prepare(`INSERT INTO known_devices (user_id, device_id, ip, user_agent, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, device_id) DO UPDATE SET ip = excluded.ip, user_agent = excluded.user_agent, last_seen_at = excluded.last_seen_at`)
    .run(userId, deviceId, clientIp(req), req.headers['user-agent'] || '', now, now);
}

export async function deviceNeedsOtp(user, deviceId, req) {
  const known = await db.prepare('SELECT * FROM known_devices WHERE user_id = ? AND device_id = ?').get(user.id, deviceId);
  if (!known) return { required: true, reason: 'new_device' };
  if (coarseLocation(known.ip) !== coarseLocation(clientIp(req))) return { required: true, reason: 'new_location' };
  return { required: false };
}

export async function issueOtp(userId, purpose) {
  const code = sixDigitCode();
  const expires = addMinutes(config.otpTtlMinutes);
  await db.prepare('UPDATE otp_codes SET consumed_at = ? WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL')
    .run(nowIso(), userId, purpose);
  await db.prepare('INSERT INTO otp_codes (user_id, purpose, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, purpose, otpHash(code, userId), expires, nowIso());
  console.log(`[otp] ${purpose} code for user ${userId}: ${code} (delivery: ${emailConfigured ? 'email' : 'console'})`);
  return { code, expiresAt: expires };
}

export function otpDevCode(code) {
  return !config.isProd && !emailConfigured ? code : undefined;
}

export async function sendLoginOtp({ user, challengeId, code }) {
  await sendOtpEmail({ to: user.email, name: user.first_name, code, purpose: 'login' });
  return { challengeId, maskedEmail: maskEmail(user.email) };
}

export async function createLoginChallenge(user, deviceId, req, reason) {
  const code = sixDigitCode();
  const challengeId = randomToken(18);
  const method = await challengeMethod(user.id);
  await db.prepare(`INSERT INTO login_challenges (id, user_id, code_hash, device_id, ip, user_agent, method, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      challengeId,
      user.id,
      otpHash(code, user.id),
      deviceId,
      clientIp(req),
      req.headers['user-agent'] || '',
      method,
      addMinutes(config.otpTtlMinutes),
      nowIso(),
    );
  return { challengeId, code, reason, method };
}

export async function verifyLoginChallenge(challengeId, code) {
  const row = await db.prepare('SELECT * FROM login_challenges WHERE id = ?').get(challengeId);
  if (!row) throw new HttpError(400, 'This sign-in attempt has expired. Please log in again.');
  if (row.consumed_at) throw new HttpError(400, 'This sign-in attempt was already used. Please log in again.');
  if (new Date(row.expires_at) < new Date()) throw new HttpError(400, 'This sign-in attempt has expired. Please log in again.');
  if (row.attempts >= 5) throw new HttpError(429, 'Too many incorrect attempts. Please log in again.');

  const security = await getSecurity(row.user_id);
  const authenticatorRequired = security.totp_confirmed_at && security.twofa_method === 'authenticator';
  const valid = authenticatorRequired
    ? verifyTotp(security.totp_secret, code)
    : row.code_hash === otpHash(String(code || '').trim(), row.user_id);
  if (!valid) {
    await db.prepare('UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    throw new HttpError(400, authenticatorRequired ? 'Incorrect authenticator code.' : 'Incorrect verification code.');
  }
  await db.prepare('UPDATE login_challenges SET consumed_at = ? WHERE id = ?').run(nowIso(), row.id);
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  return { user, deviceId: row.device_id };
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  next();
}

export function requireActive(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  if (req.user.status !== 'active') {
    return res.status(403).json({ error: 'Activate your account to unlock this feature.', code: 'ACTIVATION_REQUIRED' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  if (req.user.role !== 'admin') return res.status(404).json({ error: 'Not found.' });
  next();
}

export async function createUserNotification(userId, title, body, url = '/app') {
  await db.prepare('INSERT INTO notifications (user_id, title, body, created_at) VALUES (?, ?, ?, ?)').run(userId, title, body, nowIso());
  pushToUser(userId, title, body, url).catch(() => {});
}

export async function bootstrapWallet(userId) {
  await ensureWallet(userId);
}

export async function newSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}



export async function verifyOtpCode(userId, purpose, code) {
  const row = await db.prepare(`SELECT * FROM otp_codes WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL
    ORDER BY id DESC LIMIT 1`).get(userId, purpose);
  if (!row) throw new HttpError(400, 'No verification code is pending. Request a new one.');
  if (new Date(row.expires_at) < new Date()) throw new HttpError(400, 'That code has expired. Request a new one.');
  if (row.attempts >= 5) throw new HttpError(429, 'Too many incorrect attempts. Request a new code.');
  if (row.code_hash !== otpHash(String(code || '').trim(), userId)) {
    await db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    throw new HttpError(400, 'Incorrect verification code.');
  }
  await db.prepare('UPDATE otp_codes SET consumed_at = ? WHERE id = ?').run(nowIso(), row.id);
  return true;
}

export async function attachUser(req, res, next) {
}
