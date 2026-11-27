import express from 'express';
import { db, creditWallet } from '../db.js';
import { VIDEO_MAX_REWARD_CENTS, VIDEO_TASK_REWARDS, config } from '../config.js';
import { HttpError, nowIso, todayKey, wrap } from '../lib/util.js';
import { requireActive } from '../services/auth.js';
import { ensureDailyVideo } from '../seed.js';
import { uploadEvidence } from '../lib/upload.js';

const router = express.Router();

async function todayVideo() {
  const day = todayKey();
  await ensureDailyVideo(day);
  return await db.prepare(`SELECT v.*, c.name AS creator_name, c.handle AS creator_handle, c.platform AS creator_platform,
      c.followers AS creator_followers, c.accent AS creator_accent, c.bio AS creator_bio, dv.day
    FROM daily_videos dv JOIN videos v ON v.id = dv.video_id JOIN creators c ON c.id = v.creator_id
    WHERE dv.day = ?`).get(day);
}

async function videoPayload(userId, video) {
  if (!video) return null;
  const session = await db.prepare('SELECT * FROM watch_sessions WHERE user_id = ? AND video_id = ?').get(userId, video.id);
  const tasks = await db.prepare(`SELECT id, task_type, comment_text, status, amount_cents, admin_note, created_at
    FROM task_submissions WHERE user_id = ? AND video_id = ? ORDER BY id DESC`).all(userId, video.id);
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    videoUrl: video.video_url,
    durationSeconds: video.duration_seconds,
    rewardMaxCents: Math.min(video.reward_max_cents || VIDEO_MAX_REWARD_CENTS, VIDEO_MAX_REWARD_CENTS),
    day: video.day,
    creator: {
      id: video.creator_id,
      name: video.creator_name,
      handle: video.creator_handle,
      platform: video.creator_platform,
      followers: video.creator_followers,
      accent: video.creator_accent,
      bio: video.creator_bio,
    },
    watch: {
      watchedSeconds: session?.watched_seconds || 0,
      payoutCents: session?.payout_cents || 0,
      status: session?.status || 'not_started',
      estimatedPayoutCents: session
        ? Math.min(
          Math.round((video.reward_max_cents / 100) * (Math.min(session.watched_seconds, video.duration_seconds) / video.duration_seconds)),
          video.reward_max_cents,
        )
        : 0,
    },
    tasks,
  };
}

router.get('/today', requireActive, wrap(async (req, res) => {
  const video = await todayVideo();
  if (!video) throw new HttpError(404, 'No video is scheduled today. Check back tomorrow.');
  res.json({
    video: await videoPayload(req.user.id, video),
    taskRewards: VIDEO_TASK_REWARDS,
    maxRewardCents: VIDEO_MAX_REWARD_CENTS,
  });
}));

router.post('/:id/watch', requireActive, wrap(async (req, res) => {
  const video = await todayVideo();
  const videoId = Number(req.params.id);
  if (!video || video.id !== videoId) throw new HttpError(404, 'This video is not available today.');
  const playing = Boolean(req.body?.playing);
  if (!playing) return res.json({ ok: true, watchedSeconds: null, counting: false });

  let session = await db.prepare('SELECT * FROM watch_sessions WHERE user_id = ? AND video_id = ?').get(req.user.id, videoId);
  const now = Date.now();
  if (!session) {
    await db.prepare(`INSERT INTO watch_sessions (user_id, video_id, day, watched_seconds, payout_cents, status, heartbeat_at, created_at)
      VALUES (?, ?, ?, 0, 0, 'watching', ?, ?)`).run(req.user.id, videoId, todayKey(), nowIso(), nowIso());
    session = await db.prepare('SELECT * FROM watch_sessions WHERE user_id = ? AND video_id = ?').get(req.user.id, videoId);
  }
  if (session.status === 'paid') {
    return res.json({ ok: true, watchedSeconds: session.watched_seconds, counting: false, paid: true });
  }

  const last = new Date(session.heartbeat_at || session.created_at).getTime();
  const elapsed = Math.max(0, Math.min((now - last) / 1000, 15));
  const reported = Math.max(0, Math.min(Number(req.body?.deltaSeconds) || 0, 15));
  const increment = Math.min(elapsed + 1, reported || elapsed + 1, 15);
  const watched = Math.min(video.duration_seconds, session.watched_seconds + Math.max(0, increment));

  await db.prepare('UPDATE watch_sessions SET watched_seconds = ?, heartbeat_at = ? WHERE id = ?')
    .run(watched, nowIso(), session.id);

  res.json({
    ok: true,
    watchedSeconds: Math.floor(watched),
    durationSeconds: video.duration_seconds,
    counting: true,
    estimatedPayoutCents: Math.round((video.reward_max_cents / 100) * (watched / video.duration_seconds)),
  });
}));

router.post('/:id/finish', requireActive, wrap(async (req, res) => {
  const video = await todayVideo();
  const videoId = Number(req.params.id);
  if (!video || video.id !== videoId) throw new HttpError(404, 'This video is not available today.');
  const session = await db.prepare('SELECT * FROM watch_sessions WHERE user_id = ? AND video_id = ?').get(req.user.id, videoId);
  if (!session) throw new HttpError(400, 'Start watching the video first.');
  if (session.status === 'paid') {
    return res.json({ paid: true, payoutCents: session.payout_cents, watchedSeconds: session.watched_seconds });
  }
  if (session.watched_seconds < video.duration_seconds) {
    throw new HttpError(400, 'Watch the full video to earn. Keep it playing until the end.');
  }

  const payout = video.reward_max_cents;
  await db.transaction(() => {
    db.prepare(`UPDATE watch_sessions SET status = 'paid', payout_cents = ?, watched_seconds = ? WHERE id = ?`)
      .run(payout, video.duration_seconds, session.id);
    creditWallet(req.user.id, payout, 'video', `Watched "${video.title}" in full`, { videoId });
    db.prepare('INSERT INTO notifications (user_id, title, body, created_at) VALUES (?, ?, ?, ?)')
      .run(req.user.id, 'Video reward credited', `You earned KSh ${(payout / 100).toFixed(2)} for watching "${video.title}".`, nowIso());
  })();

  res.json({ paid: true, payoutCents: payout, watchedSeconds: video.duration_seconds });
}));

router.post('/:id/tasks', requireActive, uploadEvidence, wrap(async (req, res) => {
  const video = await todayVideo();
  const videoId = Number(req.params.id);
  if (!video || video.id !== videoId) throw new HttpError(404, 'This video is not available today.');
  const taskType = String(req.body?.taskType || '');
  if (!(taskType in VIDEO_TASK_REWARDS)) throw new HttpError(400, 'Choose a valid creator task.');
  if (!req.file) throw new HttpError(400, 'Upload a screenshot as evidence.');
  const comment = String(req.body?.comment || '').trim();
  if (taskType === 'comment' && comment.length < 8) {
    throw new HttpError(400, 'Write a positive comment of at least 8 characters.');
  }
  if (taskType === 'comment' && /(hate|stupid|idiot|ugly|trash|scam|useless|worst)/i.test(comment)) {
    throw new HttpError(400, 'Comments must be positive and respectful.');
  }
  const duplicate = await db.prepare(`SELECT id FROM task_submissions WHERE user_id = ? AND video_id = ? AND task_type = ?`)
    .get(req.user.id, videoId, taskType);
  if (duplicate) throw new HttpError(409, "You have already submitted this task for today's video.");

  const amount = VIDEO_TASK_REWARDS[taskType];
  const created = await db.prepare(`INSERT INTO task_submissions
    (user_id, video_id, creator_id, task_type, comment_text, evidence_file, status, amount_cents, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
    .run(req.user.id, videoId, video.creator_id, taskType, comment || null, req.file.filename, amount, nowIso());

  res.status(201).json({
    submission: { id: Number(created.lastInsertRowid), taskType, status: 'pending', amountCents: amount },
    message: 'Evidence submitted. Your reward will be credited after admin verification.',
    taskRewards: VIDEO_TASK_REWARDS,
  });
}));

router.get('/creators/:id', requireActive, wrap(async (req, res) => {
  const creator = await db.prepare('SELECT id, name, handle, platform, followers, bio, accent FROM creators WHERE id = ?')
    .get(Number(req.params.id));
  if (!creator) throw new HttpError(404, 'Creator not found.');
  res.json({ creator });
}));

router.get('/evidence/:id', requireActive, wrap(async (req, res) => {
  const row = await db.prepare('SELECT user_id, evidence_file FROM task_submissions WHERE id = ?').get(Number(req.params.id));
  if (!row || (row.user_id !== req.user.id && req.user.role !== 'admin')) throw new HttpError(404, 'Evidence not found.');
  res.sendFile(`${config.uploadsDir}/${row.evidence_file}`);
}));

router.get('/', requireActive, wrap(async (req, res) => {
  res.json({
    taskRewards: VIDEO_TASK_REWARDS,
    note: 'One new video is released each day. Creator tasks are verified by the admin.',
  });
}));

export default router;
