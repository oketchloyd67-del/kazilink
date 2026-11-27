import crypto from 'node:crypto';
import { config } from '../config.js';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function todayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(date);
}

export function nowIso() {
  return new Date().toISOString();
}

export function addMinutes(minutes, from = new Date()) {
  return new Date(from.getTime() + minutes * 60_000).toISOString();
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hexToBytes(bytes) {
  return Buffer.from(String(bytes), 'hex');
}

export function otpHash(code, userId) {
  return crypto
    .createHmac('sha256', config.sessionSecret)
    .update(`${userId}:${code}`)
    .digest('hex');
}

export function sixDigitCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makePublicId() {
  const bytes = crypto.randomBytes(3);
  let out = '';
  for (const byte of bytes) out += ID_ALPHABET[byte % ID_ALPHABET.length];
  return `KZ-${out}${Date.now().toString(36).slice(-2).toUpperCase()}`;
}

export function centsToKes(cents) {
  return Math.round(cents) / 100;
}

export function kesToCents(amount) {
  return Math.round(Number(amount) * 100);
}

export function formatKes(cents) {
  return `KSh ${(Math.round(cents) / 100).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function normalizePhone(input) {
  const digits = String(input || '').replace(/[^\d]/g, '');
  if (/^0(7|1)\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^254(7|1)\d{8}$/.test(digits)) return digits;
  if (/^(7|1)\d{8}$/.test(digits)) return `254${digits}`;
  return null;
}

export function maskEmail(email) {
  const [name, domain] = String(email).split('@');
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(2, name.length - 2))}@${domain}`;
}

export function maskPhone(phone) {
  return `${phone.slice(0, 6)}***${phone.slice(-2)}`;
}

export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return (ip || req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '');
}

export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export function isStrongEnough(password) {
  return typeof password === 'string' && password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

export function pick(obj, keys) {
  const out = {};
  for (const key of keys) if (obj[key] !== undefined) out[key] = obj[key];
  return out;
}
