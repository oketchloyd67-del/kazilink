import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Field, Icon, Modal, Spinner, useToast } from './ui.jsx';

export default function ChangePassword({ open, onClose, admin = false }) {
  const { push } = useToast();
  const [step, setStep] = useState('form');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [request, setRequest] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('form');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setCode('');
      setRequest(null);
      setError('');
      setBusy(false);
    }
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const data = await api('/auth/password/request', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      if (data.changed) {
        push(data.message, 'success', 7000);
        onClose?.();
        window.setTimeout(() => window.location.assign(admin ? '/admin' : '/login?changed=1'), 900);
        return;
      }
      setRequest(data);
      setStep('verify');
      push(data.message || 'Confirm the change with your verification code.', 'info', 6500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api('/auth/password/verify', {
        method: 'POST',
        body: { requestId: request.requestId, code: code.trim() },
      });
      push(data.message, 'success', 7000);
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Change password"
      description={step === 'form'
        ? 'Choose a strong password. For member accounts, the change is confirmed with your two-factor code.'
        : 'Enter the verification code to finish changing your password.'}
      size="sm"
      hideClose={busy}
    >
      {step === 'form' ? (
        <form className="stack" onSubmit={submit}>
          {error && <div className="mini-note warn" role="alert">{error}</div>}
          <Field label="Current password">
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </Field>
          <Field label="New password" hint="At least 8 characters with letters and numbers.">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
              required
            />
          </Field>
          <Field label="Confirm new password" error={confirmPassword && newPassword !== confirmPassword ? 'Passwords do not match.' : ''}>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={8}
              required
            />
          </Field>
          <div className="mini-note">
            <Icon name="shield" size={14} /> {admin
              ? 'Changing the admin password signs out every session, including this one.'
              : 'After confirming, every other device is signed out. This device stays signed in.'}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? <><Spinner small label="Checking password" /> Checking…</> : 'Continue'}
            </button>
          </div>
        </form>
      ) : (
        <form className="stack" onSubmit={verify}>
          {error && <div className="mini-note warn" role="alert">{error}</div>}
          {request?.devCode && (
            <div className="auth-note amber">
              <Icon name="info" size={15} />
              Testing mode (email delivery not configured): use code <strong>{request.devCode}</strong>
            </div>
          )}
          <Field
            label={request?.twoFactorMethod === 'authenticator' ? 'Authenticator code' : 'Email verification code'}
            hint={request?.twoFactorMethod === 'authenticator'
              ? 'Open your authenticator app and enter the current 6-digit code.'
              : `Sent to ${request?.maskedEmail || 'your email address'}.`}
          >
            <input
              className="input otp-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
              required
            />
          </Field>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setStep('form')} disabled={busy}>Back</button>
            <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>
              {busy ? <><Spinner small label="Changing password" /> Changing…</> : 'Change password'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
