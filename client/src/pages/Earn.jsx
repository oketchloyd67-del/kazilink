import { Link, useOutletContext } from 'react-router-dom';
import { useDocumentTitle, useResource } from '../hooks.js';
import { FEATURES } from '../components/Shell.jsx';
import { ErrorState, Icon, PageSkeleton, StaleNotice } from '../components/ui.jsx';

const GUIDE = {
  videos: [
    'Watch the full daily video — keep it playing until the end.',
    'Complete creator tasks (follow, like, comment, share) and upload a screenshot.',
    'Rewards are credited after admin verification within the same day.',
  ],
  status: [
    'Save today’s product image and post it on your WhatsApp status.',
    'Take a screenshot of your viewers list.',
    'Submit it with the viewer count — you earn per verified viewer.',
  ],
  affiliate: [
    'Share your personal referral link with friends.',
    'When they activate, you earn 20% commission instantly.',
    'Commission is withdrawable once you reach KSh 250.',
  ],
  sudoku: [
    'Pay KSh 30 to open a board — 3 games per day.',
    'Fill the grid in 60 seconds.',
    'Win and triple your entry fee, credited immediately.',
  ],
};

export default function Earn() {
  useDocumentTitle('Earn');
  const { promptActivation } = useOutletContext() || {};
  const { data, loading, error, stale, reload } = useResource('/features');

  if (loading && !data) return <PageSkeleton label="Loading earning options" cards={2} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} title="Earning options did not load" />;

  const active = data?.active;

  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <h1 className="page-title">Earn</h1>
          <p>Four ways to grow your balance — pick what fits your day.</p>
        </div>
        {!active && <Link to="/app/activate" className="btn btn-activate"><Icon name="spark" size={16} /> Activate</Link>}
      </div>

      {stale && <StaleNotice onRetry={reload} />}

      {!active && (
        <div className="banner-inactive" role="status">
          <div className="icon-badge"><Icon name="lock" size={18} /></div>
          <div className="grow">
            <h3>Unlock every feature with one payment</h3>
            <p>Your account is inactive. Activate it once to start earning from all four features.</p>
          </div>
          <Link to="/app/activate" className="btn btn-activate btn-sm">Activate now</Link>
        </div>
      )}

      <div className="stack">
        {FEATURES.map((feature) => {
          const content = (
            <div className="dash-grid" style={{ alignItems: 'center' }}>
              <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
                <span className="feat-icon" style={{ width: 44, height: 44, borderRadius: 13, background: feature.bg, color: feature.color, display: 'grid', placeItems: 'center', flex: 'none' }}>
                  <Icon name={feature.icon} size={20} />
                </span>
                <div>
                  <h3 className="section-title">{feature.label}</h3>
                  <p className="small muted mt-1">{feature.desc}</p>
                  <ul className="rules-list mt-2">
                    {GUIDE[feature.key].map((line) => (
                      <li key={line}><Icon name="check" size={14} />{line}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="grid-2 keep" style={{ gap: 10 }}>
                {feature.key === 'videos' && (
                  <div className="stat-card">
                    <div className="stat-label">Daily reward</div>
                    <div className="stat-value">Up to KSh 90</div>
                    <div className="stat-foot">Plus task bonuses</div>
                  </div>
                )}
                {feature.key === 'status' && (
                  <div className="stat-card">
                    <div className="stat-label">Per viewer</div>
                    <div className="stat-value">KSh 15</div>
                    <div className="stat-foot">After approval</div>
                  </div>
                )}
                {feature.key === 'affiliate' && (
                  <div className="stat-card">
                    <div className="stat-label">Commission</div>
                    <div className="stat-value">20%</div>
                    <div className="stat-foot">On every activation</div>
                  </div>
                )}
                {feature.key === 'sudoku' && (
                  <div className="stat-card">
                    <div className="stat-label">Win payout</div>
                    <div className="stat-value">KSh 90</div>
                    <div className="stat-foot">From a KSh 30 entry</div>
                  </div>
                )}
                <div className="stat-card">
                  <div className="stat-label">Today</div>
                  <div className="stat-value">{feature.key === 'sudoku' ? '3 games' : 'Open'}</div>
                  <div className="stat-foot">{active ? 'Ready to start' : 'Activation required'}</div>
                </div>
              </div>
              <div className="row wrap" style={{ gridColumn: '1 / -1', marginTop: 2 }}>
                {active ? (
                  <Link to={feature.path} className="btn btn-primary btn-sm">
                    Open {feature.label} <Icon name="arrowRight" size={14} />
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn btn-activate btn-sm"
                    onClick={() => promptActivation?.(feature)}
                  >
                    <Icon name="lock" size={13} /> Activate to unlock
                  </button>
                )}
              </div>
            </div>
          );
          return (
            <section className={`card ${active ? '' : 'flat'}`} key={feature.key} aria-labelledby={`earn-${feature.key}`}>
              <span id={`earn-${feature.key}`} className="sr-only">{feature.label}</span>
              {content}
            </section>
          );
        })}
      </div>

      <div className="mini-note mt-4">
        <strong>Fair play:</strong> rewards are verified by a human. Fake screenshots or duplicate submissions are rejected
        and repeated abuse can suspend your account.
      </div>
    </div>
  );
}
