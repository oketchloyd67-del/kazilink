import { createRequire } from 'node:module';
import { db } from '../db.js';
import { config } from '../config.js';
import { getSetting, setSetting } from '../lib/settings.js';
import { nowIso } from '../lib/util.js';

const require = createRequire(import.meta.url);
const webpush = require('web-push');

let configuredFor = '';

// VAPID keys are resolved asynchronously: env vars win, then stored settings,
// then a freshly generated pair which is persisted for later sends.
async function vapidKeys() {
  let publicKey = config.webPush.publicKey || (await getSetting('vapid_public_key', '')) || '';
  let privateKey = config.webPush.privateKey || (await getSetting('vapid_private_key', '')) || '';
  if (!publicKey || !privateKey) {
    const generated = webpush.generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;
    await setSetting('vapid_public_key', publicKey);
    await setSetting('vapid_private_key', privateKey);
  }
  return { publicKey, privateKey };
}

async function configure() {
  const { publicKey, privateKey } = await vapidKeys();
  if (configuredFor !== publicKey) {
    const subject = /^(mailto:|https?:)/i.test(config.webPush.subject)
      ? config.webPush.subject
      : 'mailto:no-reply@kazilink.app';
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configuredFor = publicKey;
  }
  return publicKey;
}

export async function getPublicKey() {
  return configure();
}

export async function pushToUser(userId, title, body, url = '/app') {
  if (!userId) return;
  const subscriptions = db.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(userId);
  if (!subscriptions.length) return;
  try {
    await configure();
  } catch (error) {
    console.error('[push] VAPID configuration failed:', error.message);
    return;
  }
  // A stable tag per topic lets a newer notification replace an older one
  // instead of stacking duplicates in the notification shade.
  const tag = `kazilink-${String(url || '/app').replace(/[^a-z0-9]+/gi, '-')}`;
  const payload = JSON.stringify({
    title: String(title || 'KaziLink').slice(0, 120),
    body: String(body || '').slice(0, 400),
    url: url || '/app',
    tag,
    icon: '/icons/icon-192.png',
  });
  await Promise.allSettled(subscriptions.map(async (row) => {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
        { TTL: 60 * 60 * 12, urgency: 'high' },
      );
      db.prepare('UPDATE push_subscriptions SET last_used_at = ? WHERE id = ?').run(nowIso(), row.id);
    } catch (error) {
      // 404/410: the browser dropped the subscription. 403: VAPID keys changed.
      if (error?.statusCode === 404 || error?.statusCode === 410 || error?.statusCode === 403) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
      } else {
        console.error('[push] delivery failed:', error?.statusCode || '', error?.message || error);
      }
    }
  }));
}

export async function pushBroadcast(userIds, title, body, url = '/app') {
  await Promise.allSettled((userIds || []).map((id) => pushToUser(id, title, body, url)));
}
