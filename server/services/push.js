import { createRequire } from 'node:module';
import { db } from '../db.js';
import { config } from '../config.js';
import { getSetting, setSetting } from '../lib/settings.js';
import { nowIso } from '../lib/util.js';

const require = createRequire(import.meta.url);
const webpush = require('web-push');

let configuredFor = '';

function vapidKeys() {
  let publicKey = config.webPush.publicKey || getSetting('vapid_public_key', '');
  let privateKey = config.webPush.privateKey || getSetting('vapid_private_key', '');
  if (!publicKey || !privateKey) {
    const generated = webpush.generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;
    setSetting('vapid_public_key', publicKey);
    setSetting('vapid_private_key', privateKey);
  }
  return { publicKey, privateKey };
}

function configure() {
  const { publicKey, privateKey } = vapidKeys();
  if (configuredFor !== publicKey) {
    webpush.setVapidDetails(config.webPush.subject, publicKey, privateKey);
    configuredFor = publicKey;
  }
  return publicKey;
}

export function getPublicKey() {
  return configure();
}

export async function pushToUser(userId, title, body, url = '/app') {
  if (!userId) return;
  const subscriptions = db.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(userId);
  if (!subscriptions.length) return;
  configure();
  const payload = JSON.stringify({ title, body, url, tag: `kazilink-${Date.now()}` });
  await Promise.allSettled(subscriptions.map(async (row) => {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
        { TTL: 60 * 60 * 12 },
      );
      db.prepare('UPDATE push_subscriptions SET last_used_at = ? WHERE id = ?').run(nowIso(), row.id);
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
      }
    }
  }));
}

export async function pushBroadcast(userIds, title, body, url = '/app') {
  await Promise.allSettled((userIds || []).map((id) => pushToUser(id, title, body, url)));
}
