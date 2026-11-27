import express from 'express';
import { db } from '../db.js';
import { config } from '../config.js';
import { HttpError, normalizePhone, nowIso, wrap } from '../lib/util.js';
import { checkCollectionStatus, initiateCollection } from '../services/tuma.js';
import { createUserNotification, requireActive, requireAuth } from '../services/auth.js';
import { sendPaymentReceipt } from '../services/email.js';

const router = express.Router();
const TERM_MS = 86_400_000 * config.trainingTermDays;

function courseRow(slug) {
  return db.prepare('SELECT * FROM training_courses WHERE slug = ? AND active = 1').get(slug);
}

function coursePayload(row) {
  let curriculum = [];
  try { curriculum = JSON.parse(row.curriculum || '[]'); } catch { curriculum = []; }
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    priceCents: row.price_cents,
    level: row.level,
    scheduleDays: row.schedule_days,
    scheduleTime: row.schedule_time,
    durationWeeks: row.duration_weeks,
    curriculum,
    accent: row.accent,
    termDays: config.trainingTermDays,
  };
}

function enrollmentPayload(row) {
  if (!row) return null;
  const expired = row.status === 'active' && row.expires_at && new Date(row.expires_at) < new Date();
  return {
    id: row.id,
    courseId: row.course_id,
    status: expired ? 'expired' : row.status,
    paidAt: row.paid_at,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    cancelledReason: row.cancelled_reason,
    active: !expired && row.status === 'active' && (!row.expires_at || new Date(row.expires_at) > new Date()),
  };
}

function myEnrollments(userId) {
  const rows = db.prepare(`SELECT e.*, c.slug, c.title FROM training_enrollments e
    JOIN training_courses c ON c.id = e.course_id WHERE e.user_id = ? ORDER BY e.updated_at DESC`).all(userId);
  return rows.map((row) => ({ ...enrollmentPayload(row), slug: row.slug, title: row.title }));
}

function activateEnrollment(userId, course, payment) {
  const now = new Date();
  const existing = db.prepare('SELECT * FROM training_enrollments WHERE user_id = ? AND course_id = ?')
    .get(userId, course.id);
  const base = existing?.status === 'active' && existing.expires_at && new Date(existing.expires_at) > now
    ? new Date(existing.expires_at)
    : now;
  const expires = new Date(base.getTime() + TERM_MS);
  if (existing) {
    db.prepare(`UPDATE training_enrollments SET status = 'active', payment_id = ?, paid_at = ?, starts_at = ?,
      expires_at = ?, cancelled_at = NULL, cancelled_reason = NULL, updated_at = ? WHERE id = ?`)
      .run(payment.id, now.toISOString(), existing.starts_at || now.toISOString(), expires.toISOString(), now.toISOString(), existing.id);
  } else {
    db.prepare(`INSERT INTO training_enrollments
      (user_id, course_id, status, payment_id, paid_at, starts_at, expires_at, created_at, updated_at)
      VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?)`)
      .run(userId, course.id, payment.id, now.toISOString(), now.toISOString(), expires.toISOString(), now.toISOString(), now.toISOString());
  }
  return expires;
}

router.get('/', requireAuth, wrap(async (req, res) => {
  const courses = db.prepare('SELECT * FROM training_courses WHERE active = 1 ORDER BY sort_order, id').all();
  res.json({
    courses: courses.map(coursePayload),
    enrollments: myEnrollments(req.user.id),
    activeAccount: req.user.status === 'active',
    termDays: config.trainingTermDays,
    currency: config.currency,
  });
}));

router.get('/room/:slug', requireAuth, wrap(async (req, res) => {
  const course = courseRow(req.params.slug);
  if (!course) throw new HttpError(404, 'Course not found.');
  if (req.user.role !== 'admin') {
    const enrollment = db.prepare('SELECT * FROM training_enrollments WHERE user_id = ? AND course_id = ?')
      .get(req.user.id, course.id);
    if (!enrollment || enrollment.status !== 'active' || (enrollment.expires_at && new Date(enrollment.expires_at) < new Date())) {
      throw new HttpError(403, 'Your training room opens after your enrollment payment is confirmed.');
    }
  }
  const enrollment = db.prepare('SELECT * FROM training_enrollments WHERE user_id = ? AND course_id = ?')
    .get(req.user.id, course.id);
  res.json({
    course: coursePayload(course),
    enrollment: enrollmentPayload(enrollment),
    room: {
      meetingNote: 'Join from this page at the scheduled time. The trainer admits enrolled students from the waiting room.',
      rules: [
        'Join five minutes before the session starts.',
        'Keep your camera on during lab sessions where possible.',
        'Recordings are shared only with enrolled students.',
        'Use the skills you learn only on systems you are authorised to test.',
      ],
    },
  });
}));

router.post('/:slug/pay', requireActive, wrap(async (req, res) => {
  const course = courseRow(req.params.slug);
  if (!course) throw new HttpError(404, 'Course not found.');
  const phone = normalizePhone(req.body?.phone || req.user.phone);
  if (!phone) throw new HttpError(400, 'Enter a valid M-Pesa phone number for the course payment.');

  db.prepare(`UPDATE course_payments SET status = 'cancelled' WHERE user_id = ? AND course_id = ? AND status = 'pending'`)
    .run(req.user.id, course.id);

  const created = db.prepare(`INSERT INTO course_payments (user_id, course_id, amount_cents, phone, provider, status, created_at)
    VALUES (?, ?, ?, ?, 'tuma', 'pending', ?)`)
    .run(req.user.id, course.id, course.price_cents, phone, nowIso());
  const paymentId = Number(created.lastInsertRowid);

  try {
    const initiated = await initiateCollection({
      amountCents: course.price_cents,
      phone,
      reference: `training-${req.user.public_id}-${paymentId}`,
      purpose: 'training',
    });
    db.prepare('UPDATE course_payments SET provider_ref = ?, meta = ? WHERE id = ?')
      .run(initiated.providerRef, JSON.stringify({ sandbox: initiated.sandbox }), paymentId);
  } catch (error) {
    db.prepare(`UPDATE course_payments SET status = 'failed', meta = ? WHERE id = ?`)
      .run(JSON.stringify({ error: error.message }), paymentId);
    throw new HttpError(502, 'We could not reach the payment service. Please try again in a moment.');
  }

  res.status(201).json({
    paymentId,
    course: coursePayload(course),
    amountCents: course.price_cents,
    phone,
    message: 'Approve the M-Pesa request on your phone to complete your enrollment.',
  });
}));

router.get('/payment/:id', requireAuth, wrap(async (req, res) => {
  const payment = db.prepare('SELECT * FROM course_payments WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), req.user.id);
  if (!payment) throw new HttpError(404, 'Course payment not found.');

  if (payment.status === 'pending') {
    let status;
    try {
      status = await checkCollectionStatus(payment.provider_ref);
    } catch {
      return res.json({ status: 'pending', message: 'Still waiting for M-Pesa to confirm the payment.' });
    }
    if (status.status === 'paid') {
      db.prepare(`UPDATE course_payments SET status = 'paid', paid_at = ? WHERE id = ?`).run(nowIso(), payment.id);
      payment.status = 'paid';
    } else if (status.status === 'failed') {
      db.prepare(`UPDATE course_payments SET status = 'failed' WHERE id = ?`).run(payment.id);
      return res.json({ status: 'failed', message: 'The payment was not completed. You can try again.' });
    } else {
      return res.json({ status: 'pending', message: 'Waiting for you to approve the M-Pesa request.' });
    }
  }

  if (payment.status !== 'paid') {
    return res.json({ status: payment.status, message: 'This course payment was not completed.' });
  }

  const course = db.prepare('SELECT * FROM training_courses WHERE id = ?').get(payment.course_id);
  const existing = db.prepare('SELECT * FROM training_enrollments WHERE user_id = ? AND course_id = ? AND payment_id = ?')
    .get(req.user.id, course.id, payment.id);
  let expiresAt = existing?.expires_at;
  if (!existing) {
    expiresAt = activateEnrollment(req.user.id, course, payment).toISOString();
    createUserNotification(
      req.user.id,
      'Training enrollment confirmed',
      `You are enrolled in ${course.title}. Your training room link is ready in the Academy. Next payment is due in ${config.trainingTermDays} days.`,
      `/app/training/room/${course.slug}`,
    );
    sendPaymentReceipt({
      to: req.user.email,
      name: req.user.first_name,
      title: `Enrollment confirmed: ${course.title}`,
      amountCents: payment.amount_cents,
      reference: `TRN-${payment.id}`,
      detail: `Your training room: ${config.appOrigin}/app/training/room/${course.slug}. Sessions run ${course.schedule_days}, ${course.schedule_time}. The next payment is due on ${new Date(expiresAt).toLocaleDateString('en-KE')}.`,
    }).catch(() => {});
  }

  res.json({
    status: 'paid',
    enrolled: true,
    course: coursePayload(course),
    expiresAt,
    roomPath: `/app/training/room/${course.slug}`,
    message: 'Payment confirmed. Your training room is now open.',
  });
}));

router.get('/payments/history', requireAuth, wrap(async (req, res) => {
  const rows = db.prepare(`SELECT p.id, p.amount_cents, p.phone, p.status, p.created_at, p.paid_at, c.title, c.slug
    FROM course_payments p JOIN training_courses c ON c.id = p.course_id
    WHERE p.user_id = ? ORDER BY p.id DESC LIMIT 25`).all(req.user.id);
  res.json({ payments: rows });
}));

export default router;
