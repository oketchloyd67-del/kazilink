import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, getDeviceId, readReferral, saveReferral } from '../api.js';
import { useAuth } from '../context.jsx';
import { useToast, Field, Icon, PasswordStrength, Spinner } from '../components/ui.jsx';
import { passwordStrength, timeGreeting } from '../lib.js';

function AuthBrandPanel() {
  return (
    <aside className="auth-brand">
      <Link to="/" className="brand-lockup">
        <img src="/img/logo.png" alt="" />
        KaziLink
      </Link>
      <div className="brand-copy">
        <h1>Your phone is your<br />side hustle.</h1>
        <p>Watch, create, refer and play. KaziLink turns small daily actions into real earnings delivered straight to M-Pesa.</p>
        <div className="brand-points">
          {[
            ['play', 'Earn up to KSh 90 for a daily video'],
            ['users', 'Get 20% commission on every activation you refer'],
            ['share', 'Promote products on WhatsApp status and earn per viewer'],
            ['grid', 'Turn KSh 30 into KSh 90 in a 60-second Sudoku round'],
          ].map(([icon, text]) => (
            <div className="brand-point" key={text}>
              <span className="dot"><Icon name={icon} size={14} /></span>
              {text}
            </div>
          ))}
        </div>
      </div>
      <p className="brand-foot">Secure sessions · M-Pesa payouts · Verified creator rewards</p>
    </aside>
  );
}

function MobileLogo() {
  return (
    <div className="auth-mobile-logo">
      <img src="/img/logo.png" alt="" />
      KaziLink
    </div>
  );
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [otp, setOtp] = useState('');
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState('');
  const { login } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const expired = params.get('expired');

  useEffect(() => {
    if (expired) push('Your session expired because you were away. Please log in again.', 'info');
  }, [expired, push]);

  const submitCredentials = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: { email, password, deviceId: getDeviceId() },
      });
      if (data.otpRequired) {
        setChallenge(data);
        push(data.message, 'info', 6000);
      } else {
        login(data.user);
        push(data.greeting || `Welcome back, @${data.user.username}.`, 'success', 6000);
        navigate('/app', { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api('/auth/login/otp', {
        method: 'POST',
        body: { challengeId: challenge.challengeId, code: otp.trim() },
      });
      login(data.user);
      push(data.greeting || `Welcome back, @${data.user.username}.`, 'success', 6000);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError('');
    try {
      const data = await api('/auth/login/resend', {
        method: 'POST',
        body: { challengeId: challenge.challengeId },
      });
      setResendNote(data.message);
      if (data.devCode) setChallenge((c) => ({ ...c, devCode: data.devCode }));
      push(data.message, 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-shell">
      <AuthBrandPanel />
      <main className="auth-main" id="main">
        <div className="auth-card">
          <MobileLogo />
          {!challenge ? (
            <>
              <div className="auth-head">
                <h2>Welcome back</h2>
                <p>Log in to check your balance and keep earning.</p>
              </div>
              {error && <div className="mini-note warn mb-3" role="alert">{error}</div>}
              <form className="auth-form" onSubmit={submitCredentials}>
                <Field label="Email or username">
                  <input
                    className="input"
                    type="text"
                    autoComplete="username"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </Field>
                <Field label="Password" htmlFor="login-password">
                  <div className="input-wrap">
                    <input
                      className="input"
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Your password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                    <span className="input-affix">
                      <button type="button" className="btn-icon" style={{ width: 34, height: 34, border: 'none' }} onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                        <Icon name="eye" size={16} />
                      </button>
                    </span>
                  </div>
                </Field>
                <button className="btn btn-primary btn-lg btn-block" disabled={loading}>
                  {loading ? <><Spinner small /> Logging in…</> : 'Log in'}
                </button>
                <div className="auth-note">
                  <Icon name="shield" size={15} />
                  For your safety, a one-time code is emailed when you log in from a new device or location. Sessions end after 20 minutes of inactivity.
                </div>
              </form>
              <p className="auth-foot">
                New to KaziLink? <Link to="/signup">Create an account</Link>
              </p>
            </>
          ) : (
            <>
              <div className="auth-head">
                <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--brand-soft)', color: 'var(--brand)', display: 'grid', placeItems: 'center', marginBottom: 14 }}>
                  <Icon name="shield" size={23} />
                </div>
                <h2>Verify this sign-in</h2>
                <p>{challenge.message || `We sent a 6-digit code to ${challenge.maskedEmail}.`} It expires in 10 minutes.</p>
              </div>
              {error && <div className="mini-note warn mb-3" role="alert">{error}</div>}
              {resendNote && <div className="mini-note mb-3" role="status">{resendNote}</div>}
              {challenge.devCode && (
                <div className="auth-note amber mb-3">
                  <Icon name="info" size={15} />
                  Testing mode (email delivery not configured): use code <strong>{challenge.devCode}</strong>
                </div>
              )}
              <form className="auth-form" onSubmit={submitOtp}>
                <Field label="Verification code" hint={`Sent to ${challenge.maskedEmail}`}>
                  <input
                    className="input otp-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoFocus
                  />
                </Field>
                <button className="btn btn-primary btn-lg btn-block" disabled={loading || otp.length !== 6}>
                  {loading ? <><Spinner small /> Verifying…</> : 'Verify & continue'}
                </button>
                <button type="button" className="btn btn-ghost btn-block" onClick={resend} disabled={resending}>
                  {resending ? <><Spinner small label="Sending a new code" /> Sending a new code…</> : 'Resend code'}
                </button>
                <div className="sr-only" role="status" aria-live="polite">
                  {resending ? 'Requesting a new verification code. Please wait.' : ''}
                </div>
                <button
                  type="button"
                  className="link-btn center"
                  onClick={() => { setChallenge(null); setOtp(''); setError(''); }}
                >
                  Use a different account
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export function SignupPage() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', username: '', phone: '', password: '', confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [refCode, setRefCode] = useState('');
  const { login } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const fromUrl = params.get('ref') || new URLSearchParams(location.search).get('ref');
    if (fromUrl) saveReferral(fromUrl.trim());
    setRefCode(readReferral());
  }, [params, location.search]);

  const update = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const strength = passwordStrength(form.password);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (strength.score < 2) {
      setError('Choose a stronger password — at least 8 characters with letters and numbers.');
      return;
    }
    setLoading(true);
    try {
      const data = await api('/auth/signup', {
        method: 'POST',
        body: { ...form, deviceId: getDeviceId(), ref: refCode || undefined },
      });
      login(data.user);
      push(`${timeGreeting()}, @${data.user.username}. Your account is ready — activate it to unlock everything.`, 'success', 7000);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <AuthBrandPanel />
      <main className="auth-main" id="main" style={{ paddingTop: 28, paddingBottom: 28 }}>
        <div className="auth-card wide">
          <MobileLogo />
          <div className="auth-head">
            <h2>Create your account</h2>
            <p>One account for earning, saving and sending money on KaziLink.</p>
          </div>
          {refCode && (
            <div className="auth-note mb-3">
              <Icon name="gift" size={15} />
              You were invited with code <strong>{refCode}</strong>. Your upline earns 20% when you activate.
            </div>
          )}
          {error && <div className="mini-note warn mb-3" role="alert">{error}</div>}
          <form className="auth-form" onSubmit={submit}>
            <div className="input-group">
              <Field label="First name">
                <input className="input" autoComplete="given-name" placeholder="Amina" value={form.firstName} onChange={update('firstName')} required />
              </Field>
              <Field label="Last name">
                <input className="input" autoComplete="family-name" placeholder="Wanjiru" value={form.lastName} onChange={update('lastName')} required />
              </Field>
            </div>
            <div className="input-group">
              <Field label="Email address" hint="Used for OTP codes and receipts.">
                <input className="input" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={update('email')} required />
              </Field>
              <Field label="Username" hint="3–20 letters, numbers or _">
                <input className="input" autoComplete="username" placeholder="amina_w" value={form.username} onChange={update('username')} required minLength={3} maxLength={20} />
              </Field>
            </div>
            <Field label="M-Pesa phone number" hint="Used for activation, payments and withdrawals.">
              <input className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" value={form.phone} onChange={update('phone')} required />
            </Field>
            <Field label="Password" htmlFor="signup-password">
              <div className="input-wrap">
                <input
                  className="input"
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Create a strong password"
                  value={form.password}
                  onChange={update('password')}
                  required
                  minLength={8}
                />
                <span className="input-affix">
                  <button type="button" className="btn-icon" style={{ width: 34, height: 34, border: 'none' }} onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    <Icon name="eye" size={16} />
                  </button>
                </span>
              </div>
            </Field>
            <PasswordStrength result={strength} />
            <Field
              label="Confirm password"
              htmlFor="signup-confirm"
              error={form.confirmPassword && form.password !== form.confirmPassword ? 'Passwords do not match.' : ''}
            >
              <input
                id="signup-confirm"
                className={`input ${form.confirmPassword && form.password !== form.confirmPassword ? 'error' : ''}`}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repeat your password"
                value={form.confirmPassword}
                onChange={update('confirmPassword')}
                required
              />
            </Field>
            <button className="btn btn-primary btn-lg btn-block" disabled={loading}>
              {loading ? <><Spinner small /> Creating account…</> : 'Create account'}
            </button>
            <div className="auth-note">
              <Icon name="info" size={15} />
              Your account starts inactive. Activate it with a one-time M-Pesa payment, then verify with the code we email you.
            </div>
            <p className="tiny muted center">
              By creating an account you agree to the <Link to="/terms">Terms and Conditions</Link> and <Link to="/privacy">Privacy Policy</Link>.
            </p>
          </form>
          <p className="auth-foot">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
