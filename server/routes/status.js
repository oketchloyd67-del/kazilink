import express from 'express';
import { db } from '../db.js';
import { STATUS_REWARD_PER_VIEWER_CENTS, WITHDRAW_BUCKETS, config } from '../config.js';
import { HttpError, nowIso, todayKey, wrap } from '../lib/util.js';
import { getSettingInt } from '../lib/settings.js';
import { requireActive } from '../services/auth.js';
import { ensureDailyProduct } from '../seed.js';
import { uploadEvidence } from '../lib/upload.js';
import { bucketSummary } from './wallet.js';

const router = express.Router();

async function dailyProduct() {
  const day = todayKey();
  await ensureDailyProduct(day);
  return await db.prepare(`SELECT p.*, dp.day FROM daily_products dp JOIN products p ON p.id = dp.product_id WHERE dp.day = ?`).get(day);
}

router.get('/today', requireActive, wrap(async (req, res) => {
  const product = await dailyProduct();
  if (!product) throw new HttpError(404, 'No product is available today. Check back tomorrow.');
  const submission = await db.prepare(`SELECT id, viewers, amount_cents, status, admin_note, evidence_file, created_at
    FROM status_submissions WHERE user_id = ? AND product_id = ?`).get(req.user.id, product.id);
  const perViewer = await getSettingInt('status_reward_per_view_cents', STATUS_REWARD_PER_VIEWER_CENTS);
  const bucket = (await bucketSummary(req.user.id)).find((b) => b.key === 'status');
  res.json({
    product: {
      id: product.id,
      name: product.name,
      description: product.description,
      imageUrl: product.image_url,
      priceCents: product.price_cents,
      day: product.day,
    },
    rewardPerViewerCents: perViewer,
    submission: submission ? {
      id: submission.id,
      viewers: submission.viewers,
      amountCents: submission.amount_cents,
      status: submission.status,
      adminNote: submission.admin_note,
      createdAt: submission.created_at,
    } : null,
    minimumWithdrawalCents: WITHDRAW_BUCKETS.status.minCents,
    maximumWithdrawalCents: WITHDRAW_BUCKETS.status.maxCents,
    availableCents: bucket?.availableCents || 0,
    instructions: [
      'Save the product image for today.',
      'Post it on your WhatsApp status with the product caption.',
      'Take a screenshot of the status viewers list.',
      'Upload the screenshot and enter the number of viewers.',
      'Get paid KSh 15 for every verified viewer after admin approval.',
    ],
  });
}));

router.post('/:productId/submit', requireActive, uploadEvidence, wrap(async (req, res) => {
  const product = dailyProduct();
  const productId = Number(req.params.productId);
  if (!product || product.id !== productId) throw new HttpError(404, 'This product is not available today.');
  if (!req.file) throw new HttpError(400, 'Upload a screenshot of your status viewers.');
  const viewers = Number.parseInt(req.body?.viewers, 10);
  if (!Number.isFinite(viewers) || viewers < 1 || viewers > 20000) {
    throw new HttpError(400, 'Enter a valid number of status viewers (1–20,000).');
  }
  const duplicate = await db.prepare('SELECT id FROM status_submissions WHERE user_id = ? AND product_id = ?')
    .get(req.user.id, productId);
  if (duplicate) throw new HttpError(409, 'You have already submitted this product’s status.');

  const perViewer = await getSettingInt('status_reward_per_view_cents', STATUS_REWARD_PER_VIEWER_CENTS);
  const amount = viewers * perViewer;
  const created = await db.prepare(`INSERT INTO status_submissions
    (user_id, product_id, day, viewers, evidence_file, status, amount_cents, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`)
    .run(req.user.id, productId, todayKey(), viewers, req.file.filename, amount, nowIso);

  res.status(201).json({
    submission: { id: Number(created.lastInsertRowid), viewers, amountCents: amount, status: 'pending' },
    message: `Submitted. KSh ${(amount / 100).toLocaleString()} will be credited after the admin verifies your screenshot.`,
  });
}));

router.get('/evidence/:id', requireActive, wrap(async (req, res) => {
  const row = await db.prepare('SELECT user_id, evidence_file FROM status_submissions WHERE id = ?').get(Number(req.params.id));
  if (!row || (row.user_id !== req.user.id && req.user.role !== 'admin')) throw new HttpError(404, 'Evidence not found.');
  res.sendFile(`${config.uploadsDir}/${row.evidence_file}`);
}));

router.get('/history', requireActive, wrap(async (req, res) => {
  const rows = await db.prepare(`SELECT ss.id, ss.viewers, ss.amount_cents, ss.status, ss.admin_note, ss.created_at, p.name
    FROM status_submissions ss JOIN products p ON p.id = ss.product_id
    WHERE ss.user_id = ? ORDER BY ss.id DESC LIMIT 20`).all(req.user.id);
  const bucket = (await bucketSummary(req.user.id)).find((b) => b.key === 'status');
  res.json({ submissions: rows, availableCents: bucket?.availableCents || 0 });
}));

export default router;
