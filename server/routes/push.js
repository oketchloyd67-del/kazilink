import express from 'express';
import { db } from '../db.js';
import { HttpError, nowIso, wrap } from '../lib/util.js';
import { requireAuth } from '../services/auth.js';
import { getPublicKey } from '../services/push.js';

const router = express.Router();

router.get('/public-key', requireAuth, wrap(async (_req, res) => {
  res.json({ publicKey: getPublicKey() });
}));

router.post('/subscribe', requireAuth, wrap(async (req, res) => {
  const subscription = req.body?.subscription;
  const endpoint = String(subscription?.endpoint || '');
  const p256dh = String(subscription?.keys?.p256dh || '');
  const auth = String(subscription?.keys?.auth || '');
  if (!endpoint.startsWith('https://') || !p256dh || !auth) {
    throw new HttpError(400, 'This device did not return a valid notification subscription.');
  }
  await db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh,
      auth = excluded.auth, user_agent = excluded.user_agent, created_at = excluded.created_at`)
    .run(req.user.id, endpoint, p256dh, auth, String(req.headers['user-agent'] || '').slice(0, 300), nowIso());
  res.status(201).json({ ok: true, message: 'Notifications enabled for this device.' });
}));

router.post('/unsubscribe', requireAuth, wrap(async (req, res) => {
  const endpoint = String(req.body?.endpoint || '');
  if (!endpoint) throw new HttpError(400, 'Missing device subscription.');
  await db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(req.user.id, endpoint);
  res.json({ ok: true, message: 'Notifications turned off for this device.' });
}));

router.get('/status', requireAuth, wrap(async (req, res) => {
  const row = await db.prepare('SELECT COUNT(*) AS c FROM push_subscriptions WHERE user_id = ?').get(req.user.id);
  res.json({ subscribedDevices: Number(row?.c) || 0 });
}));

export default router;
