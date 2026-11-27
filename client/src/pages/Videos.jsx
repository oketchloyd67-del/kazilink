import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatKes } from '../lib.js';
import { useAutoRefreshOnReconnect, useDocumentTitle, useResource } from '../hooks.js';
import {
  ErrorState, Field, Icon, Modal, PageSkeleton, Spinner, StaleNotice, StatusPill, useToast,
} from '../components/ui.jsx';

const TASK_META = {
  follow: { label: 'Follow the creator', icon: 'users' },
  like: { label: 'Like the video', icon: 'spark' },
  comment: { label: 'Leave a comment', icon: 'mail' },
  share: { label: 'Share the video', icon: 'share' },
};

function TaskModal({ open, task, video, onClose, onSubmitted }) {
  const [comment, setComment] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { push } = useToast();
  const meta = TASK_META[task] || TASK_META.follow;

  useEffect(() => {
    if (!open) {
      setComment('');
      setFile(null);
      setPreview('');
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const onFile = (event) => {
    const next = event.target.files?.[0] || null;
    setFile(next);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return next ? URL.createObjectURL(next) : '';
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!file) {
      setError('Attach a screenshot as evidence.');
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('taskType', task);
      form.append('evidence', file);
      if (comment) form.append('comment', comment);
      const data = await api(`/videos/${video.id}/tasks`, { method: 'POST', form });
      push(data.message, 'success', 6000);
      onSubmitted?.();
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={meta.label}
      description="Upload a clear screenshot proving you completed this task. It is checked by a human."
      size="sm"
      hideClose={submitting}
    >
      <form className="stack" onSubmit={submit}>
        {error && <div className="mini-note warn" role="alert">{error}</div>}
        {task === 'comment' && (
          <Field label="Your comment" hint="At least 8 characters, positive and respectful.">
            <textarea
              className="textarea"
              value={comment}
              maxLength={300}
              onChange={(event) => setComment(event.target.value)}
              placeholder="What did you enjoy about this video?"
              required
            />
          </Field>
        )}
        <div className="field">
          <span className="label" id="evidence-label">Screenshot evidence</span>
          <label className="upload-zone" htmlFor="task-evidence">
            <input
              id="task-evidence"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onFile}
              aria-labelledby="evidence-label"
            />
            <Icon name="camera" size={22} />
            <p>{file ? file.name : 'Tap to attach a JPG, PNG or WebP under 5MB'}</p>
          </label>
          {preview && <img className="upload-preview" src={preview} alt="Preview of your screenshot" />}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? <><Spinner small label="Uploading evidence" /> Uploading…</> : 'Submit evidence'}
          </button>
        </div>
        <div className="sr-only" role="status" aria-live="polite">
          {submitting ? 'Uploading your evidence. Please wait.' : ''}
        </div>
      </form>
    </Modal>
  );
}

export default function Videos() {
  useDocumentTitle('Watch & earn');
  const { data, loading, error, stale, reload } = useResource('/videos/today');
  const [watched, setWatched] = useState(0);
  const [paid, setPaid] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [playError, setPlayError] = useState('');
  const [task, setTask] = useState(null);
  const [videoError, setVideoError] = useState('');
  const playingRef = useRef(false);
  const autoFinish = useRef(false);
  const { push } = useToast();
  useAutoRefreshOnReconnect(reload);

  const video = data?.video;

  useEffect(() => {
    if (!video) return;
    setWatched(video.watch.watchedSeconds || 0);
    setPaid(video.watch.status === 'paid');
    autoFinish.current = video.watch.status === 'paid';
  }, [video]);

  const finish = useCallback(async () => {
    if (!video || finishing || paid) return;
    setFinishing(true);
    setPlayError('');
    try {
      const result = await api(`/videos/${video.id}/finish`, { method: 'POST' });
      setPaid(true);
      setWatched(result.watchedSeconds);
      push(`${formatKes(result.payoutCents)} added to your wallet.`, 'success', 6000);
    } catch (err) {
      setPlayError(err.message);
    } finally {
      setFinishing(false);
    }
  }, [video, finishing, paid, push]);

  useEffect(() => {
    if (!video || paid) return undefined;
    const timer = window.setInterval(async () => {
      if (!playingRef.current) return;
      try {
        const result = await api(`/videos/${video.id}/watch`, {
          method: 'POST',
          body: { playing: true, deltaSeconds: 5 },
        });
        if (typeof result.watchedSeconds === 'number') setWatched(result.watchedSeconds);
        if (result.paid) setPaid(true);
      } catch {
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [video, paid]);

  useEffect(() => {
    if (!video || paid || !video.durationSeconds) return;
    if (watched >= video.durationSeconds && !autoFinish.current) {
      autoFinish.current = true;
      finish();
    }
  }, [watched, video, paid, finish]);

  if (loading && !data) return <PageSkeleton label="Loading today's video" cards={1} />;
  if (error && !data) {
    const needsActivation = error.status === 403;
    return (
      <div className="page-body">
        <ErrorState error={error} onRetry={reload} title="Today's video did not load" />
        {needsActivation && <div className="center mt-2"><Link to="/app/activate" className="btn btn-activate">Activate your account</Link></div>}
      </div>
    );
  }
  if (!video) {
    return (
      <div className="empty" role="status">
        <div className="empty-icon"><Icon name="play" size={20} /></div>
        <p>No video is scheduled today. Check back tomorrow.</p>
      </div>
    );
  }

  const duration = video.durationSeconds || 1;
  const progress = Math.min(100, Math.round((watched / duration) * 100));
  const tasks = video.tasks || [];

  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <h1 className="page-title">Watch &amp; earn</h1>
          <p>{video.creator.name} · {video.creator.platform} · {formatKes(video.rewardMaxCents)} for the full video.</p>
        </div>
        <StatusPill status={paid ? 'paid' : 'pending'} />
      </div>

      {stale && <StaleNotice onRetry={reload} />}

      <div className="video-layout">
        <div>
          <div className="video-player-wrap">
            <div className="video-topline">
              <span><Icon name="clock" size={12} /> {formatKes(video.rewardMaxCents)} reward</span>
              <span>{progress}% watched</span>
            </div>
            <video
              controls
              playsInline
              preload="metadata"
              src={video.videoUrl}
              aria-label={`${video.title} by ${video.creator.name}`}
              onPlay={() => { playingRef.current = true; setVideoError(''); }}
              onPause={() => { playingRef.current = false; }}
              onEnded={() => { playingRef.current = false; finish(); }}
              onError={() => setVideoError('The video could not load. Check your connection, then try again.')}
            >
              Sorry, your browser cannot play this video.
            </video>
          </div>

          <div className="watch-bar">
            <div
              className="watch-track"
              role="progressbar"
              aria-label="Video watched"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <span className="tiny muted" style={{ whiteSpace: 'nowrap' }}>{watched}s / {duration}s</span>
          </div>

          {videoError && <div className="mini-note warn mt-2" role="alert">{videoError}</div>}
          {playError && <div className="mini-note warn mt-2" role="alert">{playError}</div>}
          {!paid && watched >= duration && (
            <button type="button" className="btn btn-primary btn-block mt-2" onClick={finish} disabled={finishing}>
              {finishing ? <><Spinner small label="Crediting your reward" /> Crediting reward…</> : `Claim ${formatKes(video.rewardMaxCents)}`}
            </button>
          )}
          <div className="sr-only" role="status" aria-live="polite">
            {finishing ? 'Crediting your video reward. Please wait.' : ''}
          </div>

          <div className="card mt-3">
            <h2 className="section-title">{video.title}</h2>
            <p className="small muted mt-1" style={{ lineHeight: 1.6 }}>{video.description}</p>
            <div className="row wrap mt-2">
              <span className="id-chip"><Icon name="clock" size={11} /> {duration}s</span>
              <span className="id-chip"><Icon name="spark" size={11} /> {video.creator.followers.toLocaleString('en-KE')} followers</span>
            </div>
            {paid && (
              <div className="celebration-note mt-3">
                <Icon name="checkCircle" size={16} />
                Reward credited. Watch again tomorrow for a new video.
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <h3>Creator</h3>
                <p>Support their channel and earn.</p>
              </div>
            </div>
            <div className="creator-card">
              <div className="creator-avatar" style={{ background: video.creator.accent }}>
                {video.creator.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
              </div>
              <div>
                <h4>{video.creator.name}</h4>
                <span>{video.creator.handle} · {video.creator.platform}</span>
                <p className="tiny muted mt-1">{video.creator.bio}</p>
              </div>
            </div>
          </section>

          <section className="card" aria-labelledby="tasks-title">
            <div className="card-head">
              <div>
                <h3 id="tasks-title">Creator tasks</h3>
                <p>Extra rewards after verification.</p>
              </div>
            </div>
            <div>
              {Object.entries(data.taskRewards || {}).map(([key, reward]) => {
                const existing = tasks.find((item) => item.task_type === key);
                const meta = TASK_META[key] || { label: key, icon: 'check' };
                return (
                  <div className="task-row" key={key}>
                    <span className="task-dot" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
                      <Icon name={meta.icon} size={14} />
                    </span>
                    <div className="task-info">
                      <strong>{meta.label}</strong>
                      <span>{existing ? <StatusPill status={existing.status} /> : 'Screenshot required'}</span>
                    </div>
                    {existing ? (
                      <span className="task-reward">{formatKes(existing.amount_cents)}</span>
                    ) : (
                      <button type="button" className="btn btn-soft btn-sm" onClick={() => setTask(key)}>
                        Earn {formatKes(reward)}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="tip-box">
            <Icon name="info" size={15} />
            Keep the video playing until the end. Rewards are only counted while the player is running.
          </div>
        </div>
      </div>

      <TaskModal
        open={Boolean(task)}
        task={task}
        video={video}
        onClose={() => setTask(null)}
        onSubmitted={() => { setTask(null); reload(); }}
      />
    </div>
  );
}
