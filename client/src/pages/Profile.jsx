import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context.jsx';
import { formatKes, initials, timeAgo } from '../lib.js';
import { useDocumentTitle, useOnline, useResource } from '../hooks.js';
import { usePrefs } from '../prefs.jsx';
import { enablePush, notificationState, pushSupported } from '../push.js';
import ChangePassword from '../components/ChangePassword.jsx';
import { LegalLinks } from '../components/Global.jsx';
import {
  CopyButton, Field, Icon, Modal, Skeleton, Spinner, StatusPill, useToast,
} from '../components/ui.jsx';

function Toggle({ checked, onChange, label, hint, id }) {
  return (
    <div className="settings-row">
      <div className="grow">
        <strong id={`${id}-label`}>{label}</strong>
        <span>{hint}</span>
      </div>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        className={`btn btn-sm ${checked ? 'btn-primary' : 'btn-ghost'}`}
        onClick={() => onChange()}
      >
        {checked ? 'On' : 'Off'}
      </button>
    </div>
  );
}

export default function Profile() {
  useDocumentTitle('Account');
  const { user, logout, refresh } = useAuth();
  const { data: wallet, loading, reload } = useResource('/wallet');
  const prefs = usePrefs();
  const online = useOnline();
  const { push } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [twoFAOpen, setTwoFAOpen] = useState(false);
  const [setup, setSetup] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [twoFABusy, setTwoFABusy] = useState(false);
  const [twoFAError, setTwoFAError] = useState('');
  const [pushState, setPushState] = useState(() => notificationState());
  const [pushBusy, setPushBusy] = useState(false);
  const [subscribedDevices, setSubscribedDevices] = useState(0);
  const security = useResource('/auth/security');

  const referralLink = user ? `${window.location.origin}/signup?ref=${encodeURIComponent(user.publicId)}` : '';

  useEffect(() => {
    if (!user) return;
    api('/push/status').then((data) => setSubscribedDevices(data.subscribedDevices)).catch(() => {});
  }, [user]);

  const turnOnNotifications = async () => {
    setPushBusy(true);
    try {
      await enablePush();
      setPushState(notificationState());
      setSubscribedDevices((count) => Math.max(1, count));
      push('Phone notifications enabled for this device.', 'success', 6000);
    } catch (error) {
      push(error.message, 'error', 7000);
    } finally {
      setPushBusy(false);
    }
  };

  const useEmailTwoFactor = async () => {
    setTwoFABusy(true);
    setTwoFAError('');
    try {
      const data = await api('/auth/security/email', { method: 'POST' });
      push(data.message, 'success', 6000);
      security.reload();
    } catch (error) {
      setTwoFAError(error.message);
    } finally {
      setTwoFABusy(false);
    }
  };

  const startAuthenticator = async () => {
    setTwoFABusy(true);
    setTwoFAError('');
    try {
      const data = await api('/auth/security/totp/setup', { method: 'POST' });
      setSetup(data);
      setTotpCode('');
      setTwoFAOpen(true);
    } catch (error) {
      setTwoFAError(error.message);
    } finally {
      setTwoFABusy(false);
    }
  };

  const confirmAuthenticator = async (event) => {
    event.preventDefault();
    setTwoFABusy(true);
    setTwoFAError('');
    try {
      const data = await api('/auth/security/totp/verify', { method: 'POST', body: { code: totpCode.trim() } });
      push(data.message, 'success', 7000);
      setTwoFAOpen(false);
      security.reload();
    } catch (error) {
      setTwoFAError(error.message);
    } finally {
      setTwoFABusy(false);
    }
  };

  const resetCookieChoice = () => {
    try { localStorage.removeItem('kazilink:cookie-consent'); } catch {}
    push('The cookie notice will be shown again.', 'success');
    window.setTimeout(() => window.location.reload(), 700);
  };

  const logoutEverywhere = async () => {
    setLoggingOut(true);
    setConfirmError('');
    try {
      await api('/auth/logout-all', { method: 'POST' });
      push('Signed out on every device.', 'success');
      setConfirmOpen(false);
      await refresh();
      window.location.assign('/login');
    } catch (err) {
      setConfirmError(err.message);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <h1 className="page-title">Account</h1>
          <p>Your details, security and comfort settings.</p>
        </div>
        <StatusPill status={user?.status || 'inactive'} />
      </div>

      <div className="dash-grid">
        <div className="dash-stack">
          <section className="card" aria-labelledby="profile-title">
            <div className="profile-header">
              <div className="avatar lg">{initials(user?.firstName, user?.lastName)}</div>
              <div className="grow">
                <h2 id="profile-title">{user?.fullName}</h2>
                <p>@{user?.username} · Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' }) : '—'}</p>
              </div>
              {user?.status !== 'active' && <Link to="/app/activate" className="btn btn-activate btn-sm">Activate</Link>}
            </div>

            <div className="kv mt-3">
              <div><span>User ID</span><strong>{user?.publicId}</strong></div>
              <div><span>Email</span><strong>{user?.email}</strong></div>
              <div><span>M-Pesa phone</span><strong>{user?.phone}</strong></div>
              <div><span>Member since</span><strong>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-KE') : '—'}</strong></div>
            </div>

            <div className="row wrap mt-3">
              <CopyButton text={user?.publicId || ''} label="Copy user ID" small />
              <Link to="/app/wallet" className="btn btn-ghost btn-sm"><Icon name="wallet" size={14} /> Wallet</Link>
            </div>
          </section>

          <section className="card" aria-labelledby="referral-title">
            <div className="card-head">
              <div>
                <h3 id="referral-title">Your referral link</h3>
                <p>Earn 20% when a friend activates.</p>
              </div>
              <Link to="/app/affiliate" className="link-btn">Details</Link>
            </div>
            <div className="copy-field">
              <code>{referralLink}</code>
              <CopyButton text={referralLink} label="Copy" small />
            </div>
          </section>

          <section className="card" aria-labelledby="security-title">
            <div className="card-head">
              <div>
                <h3 id="security-title">Security</h3>
                <p>Sessions end after 20 minutes of inactivity.</p>
              </div>
            </div>
            <div className="settings-row">
              <div className="grow">
                <strong>Signed in on this device</strong>
                <span>{online ? 'Connected securely' : 'Offline — cached data only'}</span>
              </div>
              <span className="pill active">Active</span>
            </div>
            <div className="settings-row">
              <div className="grow">
                <strong>Two-factor authentication</strong>
                <span>
                  {security.data?.method === 'authenticator'
                    ? 'Authenticator app code required on every sign-in.'
                    : 'Email code required on new devices and locations.'}
                </span>
              </div>
              <span className="pill active">{security.data?.method === 'authenticator' ? 'Authenticator' : 'Email code'}</span>
            </div>
            <div className="row wrap mt-3">
              <button type="button" className="btn btn-soft btn-sm" onClick={() => setPasswordOpen(true)}>
                <Icon name="key" size={14} /> Change password
              </button>
              {security.data?.authenticatorEnabled ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={useEmailTwoFactor} disabled={twoFABusy}>
                  {twoFABusy ? <><Spinner small label="Saving method" /> Saving…</> : 'Use email code instead'}
                </button>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={startAuthenticator} disabled={twoFABusy}>
                  {twoFABusy ? <><Spinner small label="Starting setup" /> Starting…</> : <><Icon name="shield" size={14} /> Set up authenticator app</>}
                </button>
              )}
            </div>
            {twoFAError && <div className="mini-note warn mt-2" role="alert">{twoFAError}</div>}
            <div className="row wrap mt-3">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmOpen(true)}>
                <Icon name="logout" size={14} /> Sign out everywhere
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => logout()}>
                <Icon name="logout" size={14} /> Log out
              </button>
            </div>
          </section>

          <section className="card" aria-labelledby="notify-title">
            <div className="card-head">
              <div>
                <h3 id="notify-title">Notifications</h3>
                <p>Task alerts, payment receipts and withdrawal updates.</p>
              </div>
            </div>
            <div className="settings-row">
              <div className="grow">
                <strong>Phone notifications</strong>
                <span>
                  {!pushSupported()
                    ? 'This browser does not support phone notifications.'
                    : pushState === 'granted'
                      ? `Enabled on ${subscribedDevices || 1} device${(subscribedDevices || 1) === 1 ? '' : 's'}.`
                      : pushState === 'denied'
                        ? 'Blocked in your browser settings. Allow notifications for this site to receive updates.'
                        : 'Allow notifications to hear about new tasks and payments automatically.'}
                </span>
              </div>
              {pushState === 'granted' ? (
                <span className="pill active">On</span>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={turnOnNotifications} disabled={pushBusy || pushState === 'denied' || !pushSupported()}>
                  {pushBusy ? <><Spinner small label="Enabling notifications" /> Enabling…</> : 'Enable'}
                </button>
              )}
            </div>
            <div className="settings-row">
              <div className="grow">
                <strong>Email notifications</strong>
                <span>Payment receipts and withdrawal decisions are emailed to {user?.email}.</span>
              </div>
              <Icon name="mail" size={17} />
            </div>
          </section>

          <section className="card" aria-labelledby="a11y-title">
            <div className="card-head">
              <div>
                <h3 id="a11y-title">Comfort settings</h3>
                <p>Make KaziLink easier to read and use. Saved on this device.</p>
              </div>
            </div>
            <Toggle
              id="large-text"
              checked={prefs.largeText}
              onChange={() => prefs.toggle('largeText')}
              label="Larger text"
              hint="Increase text and button sizes across the app."
            />
            <Toggle
              id="reduced-motion"
              checked={prefs.reducedMotion}
              onChange={() => prefs.toggle('reducedMotion')}
              label="Reduce motion"
              hint="Turn off animations, confetti and loading shimmer."
            />
            <div className="settings-row">
              <div className="grow">
                <strong>Theme</strong>
                <span>Choose a light or dark appearance. Saved on this device.</span>
              </div>
              <div className="theme-switch" role="group" aria-label="Theme">
                <button
                  type="button"
                  className={prefs.theme !== 'dark' ? 'active' : ''}
                  aria-pressed={prefs.theme !== 'dark'}
                  onClick={() => prefs.setTheme('light')}
                >
                  <Icon name="sun" size={14} /> Light
                </button>
                <button
                  type="button"
                  className={prefs.theme === 'dark' ? 'active' : ''}
                  aria-pressed={prefs.theme === 'dark'}
                  onClick={() => prefs.setTheme('dark')}
                >
                  <Icon name="moon" size={14} /> Dark
                </button>
              </div>
            </div>
          </section>

          <section className="card" aria-labelledby="legal-title">
            <div className="card-head">
              <div>
                <h3 id="legal-title">Privacy and cookies</h3>
                <p>Read how your data is used and manage your cookie choice.</p>
              </div>
            </div>
            <LegalLinks className="legal-links-stack" />
            <div className="row wrap mt-3">
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetCookieChoice}>
                <Icon name="refresh" size={14} /> Show cookie notice again
              </button>
            </div>
          </section>
        </div>

        <div className="dash-stack">
          <section className="card" aria-labelledby="balance-summary-title">
            <div className="card-head">
              <div>
                <h3 id="balance-summary-title">Balance</h3>
                <p>Available across all activities.</p>
              </div>
            </div>
            {loading && !wallet ? (
              <div aria-busy="true">
                <span className="sr-only">Loading balance…</span>
                <Skeleton height={32} width="60%" />
                <div style={{ height: 10 }} />
                <Skeleton height={12} width="80%" />
              </div>
            ) : (
              <>
                <div className="balance-value" style={{ color: 'var(--ink)', fontSize: '1.9rem', margin: 0 }}>
                  {formatKes(wallet?.balanceCents || 0)}
                </div>
                <p className="small muted mt-1">Lifetime {formatKes(wallet?.lifetimeEarnedCents || 0)}</p>
                <div className="row wrap mt-2">
                  <Link to="/app/wallet" className="btn btn-soft btn-sm">Open wallet</Link>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={reload}>
                    <Icon name="refresh" size={13} /> Refresh
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="card" aria-labelledby="install-title">
            <div className="card-head">
              <div>
                <h3 id="install-title">Use KaziLink anywhere</h3>
                <p>Add it to your home screen for one-tap access.</p>
              </div>
            </div>
            <ul className="rules-list">
              <li><Icon name="install" size={14} />On Android: open the browser menu and choose “Add to Home screen”.</li>
              <li><Icon name="install" size={14} />On iPhone: tap Share, then “Add to Home Screen”.</li>
              <li><Icon name="shield" size={14} />Pages you visited stay available when your connection drops.</li>
            </ul>
          </section>

          <section className="card" aria-labelledby="help-title">
            <div className="card-head">
              <div>
                <h3 id="help-title">Help</h3>
                <p>Common questions.</p>
              </div>
            </div>
            <details>
              <summary className="small strong" style={{ cursor: 'pointer', padding: '6px 0' }}>Why is my account inactive?</summary>
              <p className="small muted" style={{ lineHeight: 1.55 }}>
                New accounts need a one-time M-Pesa activation. Visit Activation and approve the prompt on your phone.
              </p>
            </details>
            <details>
              <summary className="small strong" style={{ cursor: 'pointer', padding: '6px 0' }}>How long do withdrawals take?</summary>
              <p className="small muted" style={{ lineHeight: 1.55 }}>
                Requests are reviewed by an admin and paid to your M-Pesa number. You can track status in the wallet.
              </p>
            </details>
            <details>
              <summary className="small strong" style={{ cursor: 'pointer', padding: '6px 0' }}>I did not get my activation email.</summary>
              <p className="small muted" style={{ lineHeight: 1.55 }}>
                Check your spam folder, then use “Resend code” on the activation screen. The code expires after 10 minutes.
              </p>
            </details>
          </section>

          <div className="mini-note">
            Last account update {user?.activatedAt ? timeAgo(user.activatedAt) : 'not activated yet'}.
          </div>
        </div>
      </div>

      <ChangePassword open={passwordOpen} onClose={() => setPasswordOpen(false)} />

      <Modal
        open={twoFAOpen}
        onClose={twoFABusy ? undefined : () => setTwoFAOpen(false)}
        title="Set up authenticator app"
        description="Use Google Authenticator, Authy or any TOTP app. Keep the key private."
        size="sm"
        hideClose={twoFABusy}
      >
        <form className="stack" onSubmit={confirmAuthenticator}>
          {twoFAError && <div className="mini-note warn" role="alert">{twoFAError}</div>}
          {setup && (
            <>
              <div className="mini-note">
                <strong>1. Add this key to your app</strong>
                <div className="setup-key">{setup.secret}</div>
                <a className="link-btn" href={setup.otpauthUrl}>Open in authenticator app</a>
              </div>
              <Field label="2. Enter the 6-digit code" hint="The code changes every 30 seconds.">
                <input
                  className="input otp-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                  required
                />
              </Field>
            </>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setTwoFAOpen(false)} disabled={twoFABusy}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={twoFABusy || totpCode.length !== 6}>
              {twoFABusy ? <><Spinner small label="Confirming authenticator" /> Confirming…</> : 'Enable authenticator'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={loggingOut ? undefined : () => setConfirmOpen(false)}
        title="Sign out everywhere?"
        description="All active sessions on every device will end. You will need to log in again, with an emailed code on new devices."
        size="sm"
        hideClose={loggingOut}
      >
        {confirmError && <div className="mini-note warn mb-2" role="alert">{confirmError}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmOpen(false)} disabled={loggingOut}>Keep me signed in</button>
          <button type="button" className="btn btn-danger" onClick={logoutEverywhere} disabled={loggingOut}>
            {loggingOut ? <><Spinner small label="Signing out" /> Signing out…</> : 'Sign out everywhere'}
          </button>
        </div>
        <div className="sr-only" role="status" aria-live="polite">
          {loggingOut ? 'Signing out on every device.' : ''}
        </div>
      </Modal>
    </div>
  );
}
