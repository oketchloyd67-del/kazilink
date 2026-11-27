import { db } from '../db.js';
export async function getSetting(key, fallback) {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
export async function getSettingInt(key, fallback) {
  const raw = await getSetting(key, null);
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}
export async function setSetting(key, value) {
  await db.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value));
}
