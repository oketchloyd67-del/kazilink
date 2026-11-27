import { Link } from 'react-router-dom';
import { useAuth } from '../context.jsx';
import { useDocumentTitle } from '../hooks.js';
import { FEATURES } from '../components/Shell.jsx';
import { Icon } from '../components/ui.jsx';

const STEPS = [
  ['Create your account', 'Sign up with your email and M-Pesa number in under a minute.'],
  ['Activate once', 'A single M-Pesa payment unlocks every earning feature for good.'],
  ['Earn daily', 'Watch, create, refer and play. Withdraw straight back to M-Pesa.'],
];

export default function Landing() {
  const { user } = useAuth();
  useDocumentTitle('Earn from your phone');

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header className="row-between" style={{ padding: '18px 24px', maxWidth: 1100, width: '100%', margin: '0 auto' }}>
        <Link to="/" className="brand-lockup" style={{ color: 'var(--ink)' }}>
          <img src="/img/logo.png" alt="" width="34" height="34" style={{ borderRadius: 10 }} />
          KaziLink
        </Link>
        <nav className="row" aria-label="Account">
          {user ? (
            <Link to="/app" className="btn btn-primary btn-sm">Go to dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm">Log in</Link>
              <Link to="/signup" className="btn btn-primary btn-sm">Create account</Link>
            </>
          )}
        </nav>
      </header>

      <main id="main" className="page" style={{ flex: 1 }}>
        <section className="dash-grid" style={{ alignItems: 'center', marginTop: 12 }}>
          <div>
            <span className="eyebrow">Small daily actions · real earnings</span>
            <h1 className="display mt-2" style={{ fontSize: 'clamp(2.1rem, 5.5vw, 3.4rem)' }}>
              Your phone is your side hustle.
            </h1>
            <p className="muted mt-2" style={{ maxWidth: 520, lineHeight: 1.65, fontSize: '.98rem' }}>
              KaziLink turns a few minutes a day into money sent straight to M-Pesa.
              Watch videos, complete creator tasks, share product statuses, refer friends
              and play Sudoku — all from one account.
            </p>
            <div className="row wrap mt-4">
              <Link to="/signup" className="btn btn-primary btn-lg">
                Start earning <Icon name="arrowRight" size={16} />
              </Link>
              <Link to="/login" className="btn btn-ghost btn-lg">I already have an account</Link>
            </div>
            <p className="tiny muted mt-2">
              Secure sessions · M-Pesa payouts · Verified creator rewards
            </p>
          </div>

          <div className="balance-card" aria-label="Example KaziLink earnings">
            <span className="balance-label">Available balance</span>
            <div className="balance-value">KSh 2,480<span style={{ fontSize: '.5em', opacity: .7 }}>.00</span></div>
            <p className="balance-sub">Earned from today&apos;s video, referrals and a Sudoku win.</p>
            <div className="balance-actions">
              <span className="btn btn-white"><Icon name="download" size={15} /> Withdraw</span>
              <span className="btn btn-light"><Icon name="send" size={15} /> Send</span>
            </div>
            <div className="balance-meta">
              <div><span>Today&apos;s video</span><strong>KSh 90</strong></div>
              <div><span>Commission</span><strong>20%</strong></div>
              <div><span>Payouts</span><strong>M-Pesa</strong></div>
            </div>
          </div>
        </section>

        <section className="section-gap" aria-labelledby="ways-to-earn">
          <h2 className="page-title" id="ways-to-earn">Ways to earn</h2>
          <p className="muted mt-1" style={{ fontSize: '.88rem' }}>Every activity credits the same wallet.</p>
          <div className="feature-grid mt-3">
            {FEATURES.map((feature) => (
              <div className="feature-tile" key={feature.key} style={{ cursor: 'default' }}>
                <span className="feat-icon" style={{ background: feature.bg, color: feature.color }}>
                  <Icon name={feature.icon} size={18} />
                </span>
                <div>
                  <h4>{feature.label}</h4>
                  <p>{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section-gap" aria-labelledby="how-it-works">
          <h2 className="page-title" id="how-it-works">How it works</h2>
          <div className="grid-3 mt-3">
            {STEPS.map(([title, text], index) => (
              <div className="card" key={title}>
                <span className="id-chip">Step {index + 1}</span>
                <h3 className="section-title mt-2">{title}</h3>
                <p className="small muted mt-1" style={{ lineHeight: 1.55 }}>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card mt-4" style={{ background: 'linear-gradient(135deg, #f3efff, #fff8ee)' }}>
          <div className="row-between wrap">
            <div>
              <h2 className="section-title">Ready when you are</h2>
              <p className="small muted mt-1">Create an account, activate it once, and start with today&apos;s video.</p>
            </div>
            <Link to="/signup" className="btn btn-primary">Create free account</Link>
          </div>
        </section>
      </main>

      <footer style={{ padding: '22px 24px', borderTop: '1px solid var(--line)', textAlign: 'center' }} className="tiny muted">
        © {new Date().getFullYear()} KaziLink · Built for Kenyan hustlers · <Link to="/admin" style={{ color: 'var(--brand)' }}>Admin</Link>
      </footer>
    </div>
  );
}
