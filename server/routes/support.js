import express from 'express';
import { db } from '../db.js';
import { config } from '../config.js';
import { HttpError, nowIso, wrap } from '../lib/util.js';
import { rateLimit } from '../lib/ratelimit.js';
import { answerQuestion } from '../lib/chatbot.js';
import { createUserNotification, requireAuth } from '../services/auth.js';
import { sendSupportEmail } from '../services/email.js';

const router = express.Router();
const chatLimiter = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'chat' });
const ticketLimiter = rateLimit({ windowMs: 60 * 60_000, max: 10, keyPrefix: 'ticket' });

router.use(requireAuth);

router.post('/chat', chatLimiter, wrap(async (req, res) => {
  const message = String(req.body?.message || '').slice(0, 500);
  res.json(answerQuestion(message));
}));

router.post('/message', ticketLimiter, wrap(async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const category = String(req.body?.category || 'other').slice(0, 40);
  if (message.length < 10) throw new HttpError(400, 'Write a little more so the team can help you.');
  if (message.length > 2000) throw new HttpError(400, 'Keep your request under 2,000 characters.');

  const created = db.prepare(`INSERT INTO support_messages (user_id, category, message, status, created_at)
    VALUES (?, ?, ?, 'open', ?)`).run(req.user.id, category, message, nowIso());

  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
  for (const admin of admins) {
    createUserNotification(admin.id, 'New member support request', `@${req.user.username}: ${message.slice(0, 120)}`, '/admin');
  }
  sendSupportEmail({
    to: config.supportEmail,
    name: `${req.user.first_name} @${req.user.username}`,
    message,
    category,
  }).catch(() => {});

  res.status(201).json({
    ticket: { id: Number(created.lastInsertRowid), status: 'open', category },
    message: 'Your request was sent to the KaziLink team. You will get a notification when it is answered.',
  });
}));

router.get('/messages', wrap(async (req, res) => {
  const rows = db.prepare(`SELECT id, category, message, status, admin_reply, replied_at, created_at
    FROM support_messages WHERE user_id = ? ORDER BY id DESC LIMIT 25`).all(req.user.id);
  res.json({
    messages: rows,
    openCount: rows.filter((row) => row.status === 'open').length,
  });
}));

export default router;
