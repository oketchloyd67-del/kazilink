import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context.jsx';
import { formatKes, timeAgo } from '../lib.js';
import { useAutoRefreshOnReconnect, useDocumentTitle, useResource } from '../hooks.js';
import {
  ErrorState, Field, Icon, Modal, PageSkeleton, Spinner, StaleNotice, StatusPill, useToast,
} from '../components/ui.jsx';

const COURSE_STYLE = {
  'cyber-security': { icon: 'shield', color: '#5b3df5', bg: 'var(--brand-soft)' },
  'web-development': { icon: 'code', color: '#0f9b6c', bg: 'var(--green-soft)' },
  'penetration-testing': { icon: 'target', color: '#c14860', bg: 'var(--red-soft)' },
};

export default function Training() {
  useDocumentTitle('Training Academy');
  const { user, refresh } = useAuth();
  const { promptActivation } = useOutletContext() || {};
  const { push } = useToast();
  const { data, loading, error, stale, reload } = useResource('/training');
  const payments = useResource('/training/payments/history');
  const [course, setCourse] = useState(null);
  const [phone, setPhone] = useState('');
  const [payment, setPayment] = useState(null);
  const [phase, setPhase] = useState('form');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(null);
  useAutoRefreshOnReconnect(reload);

  useEffect(() => {
    if (phase !== 'waiting' || !payment) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const result = await api(`/training/payment/${payment.paymentId}`);
        if (result.status === 'paid') {
          setSuccess(result);
          setPhase('done');
          setMessage(result.message);
          setPayment(null);
          reload();
          payments.reload();
          refresh();
          push(result.message, 'success', 7000);
        } else if (result.status === 'failed') {
          setFormError(result.message);
          setPhase('form');
          setPayment(null);
        }
      } catch {
        setMessage('Still checking the payment. Keep this page open.');
      }
    }, 4500);
    return () => window.clearInterval(timer);
  }, [phase, payment, reload, payments.reload, refresh, push]);

  const openCourse = (item) => {
    if (user?.status !== 'active') {
      promptActivation?.({ label: 'Training Academy' });
      return;
    }
    setCourse(item);
    setPhone(user?.phone || '');
    setPhase('form');
    setPayment(null);
    setFormError('');
    setMessage('');
    setSuccess(null);
  };

  const startPayment = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const result = await api(`/training/${course.slug}/pay`, { method: 'POST', body: { phone } });
      setPayment(result);
      setMessage(result.message);
      setPhase('waiting');
      push('M-Pesa request sent. Approve it on your phone.', 'info', 6000);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const checkNow = async () => {
    if (!payment) return;
    setChecking(true);
    try {
      const result = await api(`/training/payment/${payment.paymentId}`);
      if (result.status === 'paid') {
        setSuccess(result);
        setPhase('done');
        setPayment(null);
        reload();
        payments.reload();
        refresh();
        push(result.message, 'success', 7000);
      } else if (result.status === 'failed') {
        setFormError(result.message);
        setPhase('form');
        setPayment(null);
      } else {
        setMessage(result.message);
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setChecking(false);
    }
  };

  if (loading && !data) return <PageSkeleton label="Loading the training academy" cards={3} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} title="The academy did not load" />;
  if (!data) return null;

  const enrollmentFor = (slug) => data.enrollments.find((item) => item.slug === slug);
  const active = user?.status === 'active';

  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <h1 className="page-title">Training Academy</h1>
          <p>Live, instructor-led tracks. Each payment covers a {data.termDays}-day term.</p>
        </div>
        {!active && <Link to="/app/activate" className="btn btn-activate"><Icon name="spark" size={15} /> Activate to enroll</Link>}
      </div>

      {stale && <StaleNotice onRetry={reload} />}

      {!active && (
        <div className="banner-inactive" role="status">
          <div className="icon-badge"><Icon name="lock" size={18} /></div>
          <div className="grow">
            <h3>Enrollment requires an active account</h3>
            <p>You can browse every course now. Activate your account to enroll and open the training rooms.</p>
          </div>
          <Link to="/app/activate" className="btn btn-activate btn-sm">Activate now</Link>
        </div>
      )}

      <section className="academy-hero">
        <div>
          <span className="eyebrow" style={{ color: 'rgba(255,255,255,.7)' }}>Skills that pay</span>
          <h2>Learn a high-income skill with live trainers.</h2>
          <p>Fixed weekly sessions, practical labs, recorded materials and a training room that opens as soon as your payment is confirmed.</p>
        </div>
        <div className="academy-hero-stats">
          <div><strong>3</strong><span>Tracks</span></div>
          <div><strong>12</strong><span>Weeks each</span></div>
          <div><strong>3</strong><span>Months per term</span></div>
        </div>
      </section>

      <div className="training-grid">
        {data.courses.map((item) => {
          const style = COURSE_STYLE[item.slug] || COURSE_STYLE['cyber-security'];
          const enrollment = enrollmentFor(item.slug);
          return (
            <article className="card training-card" key={item.slug}>
              <div className="training-card-head">
                <span className="feat-icon" style={{ background: style.bg, color: style.color, width: 44, height: 44, borderRadius: 13 }}>
                  <Icon name={style.icon} size={21} />
                </span>
                <div className="grow">
                  <h3>{item.title}</h3>
                  <span className="tiny muted">{item.level} · {item.durationWeeks} weeks</span>
                </div>
                {enrollment && <StatusPill status={enrollment.active ? 'active' : enrollment.status} />}
              </div>
              <p className="small muted">{item.summary}</p>
              <div className="training-meta">
                <div><Icon name="clock" size={14} /><span>{item.scheduleDays}<br />{item.scheduleTime}</span></div>
                <div><Icon name="certificate" size={14} /><span>{item.termDays}-day access<br />Renews every 3 months</span></div>
              </div>
              <ul className="training-curriculum">
                {item.curriculum.slice(0, 4).map((line) => (
                  <li key={line}><Icon name="check" size={12} />{line}</li>
                ))}
              </ul>
              <div className="training-price">
                <div>
                  <span>Course fee</span>
                  <strong>{formatKes(item.priceCents)}</strong>
                  <small>per 3-month term</small>
                </div>
                {enrollment?.active ? (
                  <div className="stack-sm" style={{ alignItems: 'stretch' }}>
                    <Link to={`/app/training/room/${item.slug}`} className="btn btn-primary btn-sm">
                      <Icon name="book" size={14} /> Open training room
                    </Link>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openCourse(item)}>
                      Renew for {formatKes(item.priceCents)}
                    </button>
                  </div>
                ) : (
                  <button type="button" className={`btn ${active ? 'btn-primary' : 'btn-activate'} btn-sm`} onClick={() => openCourse(item)}>
                    {active ? 'Enroll now' : <><Icon name="lock" size={13} /> Activate to enroll</>}
                  </button>
                )}
              </div>
              {enrollment?.expiresAt && (
                <p className="tiny muted">
                  {enrollment.active ? 'Access until' : 'Previous access ended'} {new Date(enrollment.expiresAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
              {enrollment?.cancelledReason && (
                <p className="tiny" style={{ color: 'var(--red)' }}>Cancelled: {enrollment.cancelledReason}</p>
              )}
            </article>
          );
        })}
      </div>

      <section className="card mt-3" aria-labelledby="training-payments-title">
        <div className="card-head">
          <div>
            <h3 id="training-payments-title">Course payments</h3>
            <p>Every payment, renewal and receipt in one place.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={payments.reload}>
            <Icon name="refresh" size={13} /> Refresh
          </button>
        </div>
        {payments.loading && !payments.data ? (
          <div className="center" style={{ padding: 20 }}><Spinner label="Loading course payments" /></div>
        ) : payments.data?.payments?.length ? (
          <div className="tx-list">
            {payments.data.payments.map((item) => (
              <div className="tx-row" key={item.id}>
                <div className="tx-icon" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
                  <Icon name="book" size={15} />
                </div>
                <div className="tx-main">
                  <strong>{item.title}</strong>
                  <span>{timeAgo(item.created_at)} · {item.phone}</span>
                </div>
                <div className="tx-amount">
                  {formatKes(item.amount_cents)}
                  <small><StatusPill status={item.status} /></small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <div className="empty-icon"><Icon name="book" size={20} /></div>
            <p>No course payments yet. Choose a track above to enroll.</p>
          </div>
        )}
      </section>

      <div className="mini-note mt-3">
        <strong>How the term works:</strong> your course fee covers {data.termDays} days (about 3 months). You keep the same room access when you renew before the term ends. Training sessions run on fixed days shown on each course.
      </div>

      <Modal
        open={Boolean(course)}
        onClose={busy || phase === 'waiting' ? undefined : () => setCourse(null)}
        title={course ? (phase === 'done' ? 'Enrollment confirmed' : phase === 'waiting' ? 'Waiting for M-Pesa' : `Enroll in ${course.title}`) : ''}
        description={course ? (phase === 'done' ? 'Your training room is open.' : phase === 'waiting' ? 'Approve the payment request on your phone.' : `${formatKes(course.priceCents)} covers a ${course.termDays}-day term.`) : ''}
        hideClose={busy || phase === 'waiting'}
      >
        {course && (
          <>
            {phase === 'done' && success ? (
              <div className="celebrate">
                <div className="celebrate-icon"><Icon name="checkCircle" size={38} /></div>
                <h2>{formatKes(success.course.priceCents)} paid</h2>
                <p>{success.message}</p>
                <div className="mini-note mt-3">
                  Access until {new Date(success.expiresAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}. Sessions: {course.scheduleDays}, {course.scheduleTime}.
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setCourse(null)}>Close</button>
                  <Link to={success.roomPath} className="btn btn-primary" onClick={() => setCourse(null)}>
                    <Icon name="book" size={15} /> Open training room
                  </Link>
                </div>
              </div>
            ) : phase === 'waiting' && payment ? (
              <div className="pay-wait" role="status" aria-live="polite">
                <div className="pulse-ring"><Spinner label="Waiting for M-Pesa" /></div>
                <h3>Check your phone</h3>
                <p>We sent a {formatKes(payment.amountCents)} request for {course.title}. Enter your M-Pesa PIN on your handset to approve it.</p>
                {message && <p className="tiny muted" style={{ marginTop: 8 }}>{message}</p>}
                <div className="wait-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={checkNow} disabled={checking}>
                    {checking ? <><Spinner small label="Checking payment" /> Checking…</> : <><Icon name="refresh" size={14} /> I have approved it</>}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setPhase('form'); setPayment(null); }} disabled={checking}>
                    Cancel payment
                  </button>
                </div>
                {formError && <div className="mini-note warn mt-3" role="alert">{formError}</div>}
              </div>
            ) : (
              <form className="stack" onSubmit={startPayment}>
                {formError && <div className="mini-note warn" role="alert">{formError}</div>}
                <div className="pay-summary">
                  <div className="amount">{formatKes(course.priceCents)}</div>
                  <p>{course.title} · 3-month term</p>
                </div>
                <Field label="M-Pesa phone number" hint="The STK request is sent to this number.">
                  <input
                    className="input"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="0712 345 678"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                  />
                </Field>
                <div className="tip-box">
                  <Icon name="info" size={15} />
                  After payment is confirmed, the training room link appears here and in your notifications. Your term renews after {course.termDays} days.
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setCourse(null)} disabled={busy}>Not now</button>
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? <><Spinner small label="Sending payment request" /> Sending request…</> : `Pay ${formatKes(course.priceCents)}`}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
