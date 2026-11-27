import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context.jsx';
import { formatKes } from '../lib.js';
import { useDocumentTitle, useResource } from '../hooks.js';
import {
  Confetti, ErrorState, Field, Icon, PageSkeleton, Spinner, useToast,
} from '../components/ui.jsx';

const PHASE = { FORM: 'form', WAITING: 'waiting', OTP: 'otp', DONE: 'done' };

export default function Activate() {
  useDocumentTitle('Activate account');
  const { data, loading, error, reload } = useResource('/activation');
  const { setUser } = useAuth();
  const { push } = useToast();

  const [phase, setPhase] = useState(null);
  const [phone, setPhone] = useState('');
  const [payment, setPayment] = useState(null);
  const [otpInfo, setOtpInfo] = useState(null);
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState('');
  const [otpError, setOtpError] = useState('');
  const [initiating, setInitiating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState('');
  const [devCode, setDevCode] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(null);

  useEffect(() => {
    if (!data || phase) return;
    setPhone(data.phone || '');
    if (data.status === 'active') setPhase(PHASE.DONE);
    else if (data.awaitingOtp) setPhase(PHASE.OTP);
    else setPhase(PHASE.FORM);
  }, [data, phase]);

  const finishActivation = useCallback((user) => {
    if (user) setUser(user);
    setPhase(PHASE.DONE);
    setOtpInfo(null);
    push('Your account is active. Every feature is unlocked.', 'success', 7000);
    reload();
  }, [push, reload, setUser]);

  const checkStatus = useCallback(async () => {
    if (!payment) return;
    setChecking(true);
    try {
      const result = await api(`/activation/payment/${payment.id}`);
      if (result.status === 'paid') {
        if (result.active) {
          finishActivation(result.user);
          return;
        }
        setOtpInfo(result);
        setDevCode(result.devCode || '');
        setPhase(PHASE.OTP);
        push('Payment received. Check your email for the activation code.', 'success', 6000);
      } else if (result.status === 'failed' || result.status === 'cancelled') {
        setFormError(result.message || 'The payment was not completed. You can try again.');
        setPhase(PHASE.FORM);
        setPayment(null);
        reload();
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setChecking(false);
    }
  }, [payment, finishActivation, push, reload]);

  useEffect(() => {
    if (phase !== PHASE.WAITING) return undefined;
    const timer = window.setInterval(checkStatus, 4500);
    return () => window.clearInterval(timer);
  }, [phase, checkStatus]);

  useEffect(() => {
    if (phase !== PHASE.WAITING) return undefined;
    startedAt.current = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const initiate = async (event) => {
    event.preventDefault();
    setFormError('');
    setInitiating(true);
    try {
      const result = await api('/activation/initiate', { method: 'POST', body: { phone } });
      setPayment(result);
      setPhase(PHASE.WAITING);
      push('Request sent to M-Pesa. Approve it on your phone.', 'info', 6000);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setInitiating(false);
    }
  };

  const verify = async (event) => {
    event.preventDefault();
    setOtpError('');
    setVerifying(true);
    try {
      const result = await api('/activation/verify', { method: 'POST', body: { code: code.trim() } });
      finishActivation(result.user);
    } catch (err) {
      setOtpError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setOtpError('');
    setResendNote('');
    try {
      const result = await api('/activation/resend', { method: 'POST' });
      setResendNote(result.message);
      if (result.devCode) setDevCode(result.devCode);
      push(result.message, 'success');
    } catch (err) {
      setOtpError(err.message);
    } finally {
      setResending(false);
    }
  };

  if (loading && !data) return <PageSkeleton label="Checking your activation" cards={1} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} title="Activation did not load" />;
  if (!data) return null;

  if (data.status === 'active' || phase === PHASE.DONE) {
    return (
      <div className="page-body activation-wrap">
        <Confetti />
        <section className="card celebrate">
          <div className="celebrate-icon"><Icon name="checkCircle" size={40} /></div>
          <h1 className="page-title">You are active!</h1>
          <p className="mt-1">
            Every KaziLink feature is unlocked. Start with today&apos;s video, then try a Sudoku board or invite a friend.
          </p>
          <div className="row wrap mt-4" style={{ justifyContent: 'center' }}>
            <Link to="/app/videos" className="btn btn-primary"><Icon name="play" size={15} /> Watch today&apos;s video</Link>
            <Link to="/app" className="btn btn-ghost">Dashboard</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-body activation-wrap">
      <div className="page-head">
        <div>
          <h1 className="page-title">Activate your account</h1>
          <p>One payment unlocks every earning feature for good.</p>
        </div>
      </div>

      <div className="activation-hero">
        <h2>Unlock all four earning features</h2>
        <p>Pay once with M-Pesa, verify with the code we email you, and start earning today.</p>
        <div className="fee-line">
          <span>One-time activation fee</span>
          <strong>{formatKes(data.feeCents)}</strong>
        </div>
      </div>

      {phase === PHASE.FORM && (
        <section className="card" aria-labelledby="pay-title">
          <div className="card-head">
            <div>
              <h3 id="pay-title">Pay with M-Pesa</h3>
              <p>We send an STK push to your phone. Approve it with your M-Pesa PIN.</p>
            </div>
            <span className="id-chip"><Icon name="phone" size={11} /> Secure</span>
          </div>

          {formError && <div className="mini-note warn mb-2" role="alert">{formError}</div>}

          <form className="stack" onSubmit={initiate}>
            <Field label="M-Pesa phone number" hint="The number that will receive the payment prompt.">
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
            <div className="mini-note">
              <strong>What happens next:</strong> you will get a prompt on your phone, enter your M-Pesa PIN there,
              then use the code sent to {data.maskedEmail} to finish activation.
            </div>
            <button type="submit" className="btn btn-activate btn-lg btn-block" disabled={initiating}>
              {initiating
                ? <><Spinner small label="Sending M-Pesa request" /> Sending request to M-Pesa…</>
                : <>Pay {formatKes(data.feeCents)} &amp; activate</>}
            </button>
            <div className="sr-only" role="status" aria-live="polite">
              {initiating ? 'Sending your payment request to M-Pesa. Please wait.' : ''}
            </div>
          </form>
        </section>
      )}

      {phase === PHASE.WAITING && payment && (
        <section className="card" aria-labelledby="wait-title">
          <div className="pay-wait" role="status" aria-live="polite">
            <div className="pulse-ring"><Spinner label="Waiting for M-Pesa" /></div>
            <h3 id="wait-title">Check your phone</h3>
            <p>
              We sent a KSh {(payment.amountCents / 100).toLocaleString('en-KE')} request to{' '}
              <strong>{payment.maskedPhone}</strong>. Enter your M-Pesa PIN on your handset to approve it.
            </p>
            <p className="tiny muted" style={{ marginTop: 10 }}>
              Waiting for confirmation… {elapsed}s. Keep this page open.
            </p>
            <div className="wait-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={checkStatus} disabled={checking}>
                {checking ? <><Spinner small label="Checking payment" /> Checking…</> : <><Icon name="refresh" size={14} /> I have approved it</>}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setPhase(PHASE.FORM); setPayment(null); reload(); }}
                disabled={checking}
              >
                Cancel payment
              </button>
            </div>
            {formError && <div className="mini-note warn mt-3" role="alert">{formError}</div>}
          </div>
        </section>
      )}

      {phase === PHASE.OTP && (
        <section className="card" aria-labelledby="otp-title">
          <div className="card-head">
            <div>
              <h3 id="otp-title">Verify your email</h3>
              <p>
                Enter the 6-digit code sent to {otpInfo?.maskedEmail || data.maskedEmail}. It expires in 10 minutes.
              </p>
            </div>
            <span className="id-chip"><Icon name="mail" size={11} /> Email</span>
          </div>

          {otpError && <div className="mini-note warn mb-2" role="alert">{otpError}</div>}
          {resendNote && <div className="mini-note mb-2" role="status">{resendNote}</div>}
          {(devCode || otpInfo?.devCode) && (
            <div className="auth-note amber mb-2">
              <Icon name="info" size={15} />
              Testing mode (email delivery not configured): use code <strong>{devCode || otpInfo.devCode}</strong>
            </div>
          )}

          <form className="stack" onSubmit={verify}>
            <Field label="Activation code" hint="6 digits, sent to your email address.">
              <input
                className="input otp-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
                required
              />
            </Field>
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={verifying || code.length !== 6}>
              {verifying ? <><Spinner small label="Verifying your code" /> Verifying…</> : 'Verify & activate account'}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={resend} disabled={resending}>
              {resending ? <><Spinner small label="Resending code" /> Sending a new code…</> : 'Resend code'}
            </button>
            <div className="sr-only" role="status" aria-live="polite">
              {verifying ? 'Verifying your activation code.' : ''}
            </div>
          </form>

          <div className="mini-note mt-3">
            Did not get the email? Check spam, or{' '}
            <button type="button" className="link-btn" onClick={resend} disabled={resending}>send it again</button>.
          </div>
        </section>
      )}

      <p className="tiny muted center mt-3">
        Activation payments are processed securely. We never see or store your M-Pesa PIN.
      </p>
    </div>
  );
}
