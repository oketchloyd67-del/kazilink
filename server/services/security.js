import crypto from 'node:crypto';
import { db } from '../db.js';
import { config } from '../config.js';
import { HttpError, nowIso, addMinutes } from '../lib/util.js';


const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const clean = String(input || '').replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function totpCode(secret, at = Date.now()) {
  const counter = Math.floor(at / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const number = (
    ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff)
  ) % 1_000_000;
  return String(number).padStart(6, '0');
}

export function verifyTotp(secret, code, window = 1) {
  if (!secret || !/^\d{6}$/.test(String(code || '').trim())) return false;
  const clean = String(code).trim();
  const now = Date.now();
  for (let offset = -window; offset <= window; offset++) {
    if (totpCode(secret, now + offset * 30_000) === clean) return true;
  }
  return false;
}

export function otpauthUrl({ secret, email, issuer = 'KaziLink' }) {
  const label = `${issuer}:${email}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export async function getSecurity(userId) {
  const row = await db.prepare('SELECT * FROM user_security WHERE user_id = ?').get(userId);
  return row || {
    user_id: userId,
    twofa_method: 'email',
    totp_secret: null,
    totp_confirmed_at: null,
  };
}

async function ensureSecurityRow(userId) {
  const existing = await db.prepare('SELECT user_id FROM user_security WHERE user_id = ?').get(userId);
  if (!existing) {
    await db.prepare('INSERT INTO user_security (user_id, twofa_method, updated_at) VALUES (?, ?, ?)')
      .run(userId, 'email', nowIso());
  }
}

export async function ensureSecurityRowAsync(userId) {
  const existing = await db.prepare('SELECT user_id FROM user_security WHERE user_id = ?').get(userId);
  if (!existing) {
    await db.prepare('INSERT INTO user_security (user_id, twofa_method, updated_at) VALUES (?, ?, ?)')
      .run(userId, 'email', nowIso());
  }
}

export async function setTwoFactorMethod(userId, method) {
  if (!['email', 'authenticator'].includes(method)) throw new HttpError(400, 'Choose a valid verification method.');
  if (method === 'authenticator') {
    const security = await getSecurity(userId);
    if (!security.totp_confirmed_at) throw new HttpError(400, 'Set up your authenticator app first.');
  }
  await ensureSecurityRow(userId);
  await db.prepare('UPDATE user_security SET twofa_method = ?, updated_at = ? WHERE user_id = ?')
    .run(method, nowIso(), userId);
  return getSecurity(userId);
}

export async function startTotpSetup(userId, email) {
  await ensureSecurityRowAsync(userId);
  const secret = generateTotpSecret();
  await db.prepare('UPDATE user_security SET totp_secret = ?, totp_confirmed_at = NULL, updated_at = ? WHERE user_id = ?')
    .run(secret, nowIso(), userId);
  return { secret, otpauthUrl: otpauthUrl({ secret, email }) };
}

export async function confirmTotpSetup(userId, code) {
  const security = await getSecurity(userId);
  if (!security.totp_secret) throw new HttpError(400, 'Start the authenticator setup first.');
  if (!verifyTotp(security.totp_secret, code)) throw new HttpError(400, 'That code is not valid. Check your authenticator app and try again.');
  await db.prepare(`UPDATE user_security SET totp_confirmed_at = ?, twofa_method = 'authenticator', updated_at = ? WHERE user_id = ?`)
    .run(nowIso(), nowIso(), userId);
  return getSecurity(userId);
}

export async function twoFactorSummary(user) {
  const security = await getSecurity(user.id);
  return {
    method: security.totp_confirmed_at ? security.twofa_method : 'email',
    authenticatorEnabled: Boolean(security.totp_confirmed_at),
    maskedEmail: user.email ? `${user.email.slice(0, 2)}${'*'.repeat(Math.max(2, user.email.split('@')[0].length - 2))}@${user.email.split('@')[1]}` : '',
    availableMethods: [
      { key: 'email', label: 'Email code', description: 'A one-time code is emailed when you sign in from a new device or location.' },
      { key: 'authenticator', label: 'Authenticator app', description: 'A code from Google Authenticator, Authy or any TOTP app is required on every sign-in.' },
    ],
    otpTtlMinutes: config.otpTtlMinutes,
  };
}

export async function challengeMethod(userId) {
  const security = await getSecurity(userId);
  return security.totp_confirmed_at && security.twofa_method === 'authenticator' ? 'authenticator' : 'email';
}
