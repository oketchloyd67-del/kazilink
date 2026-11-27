import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../context.jsx';
import { formatKes, greetingFor, nairobiDayLabel, timeAgo } from '../lib.js';
import { useAutoRefreshOnReconnect, useDocumentTitle, useResource } from '../hooks.js';
import { FEATURES } from '../components/Shell.jsx';
import {
  ErrorState, Icon, PageSkeleton, StaleNotice, WithdrawModal,
} from '../components/ui.jsx';
import SendMoneyModal from '../components/SendMoney.jsx';

const TX_META = {
  video: { icon: 'play', color: 'var(--brand)', bg: 'var(--brand-soft)' },
  video_task: { icon: 'checkCircle', color: 'var(--brand)', bg: 'var(--brand-soft)' },
  affiliate: { icon: 'users', color: '#0f9b6c', bg: 'var(--green-soft)' },
  status: { icon: 'share', color: '#0f9b6c', bg: 'var(--green-soft)' },
  sudoku: { icon: 'grid', color: '#b06a00', bg: 'var(--orange-soft)' },
  withdrawal: { icon: 'download', color: '#c14860', bg: 'var(--red-soft)' },
  withdrawal_refund: { icon: 'refresh', color: '#0f9b6c', bg: 'var(--green-soft)' },
  p2p_in: { icon: 'arrowDown', color: '#0f9b6c', bg: 'var(--green-soft)' },
  p2p_out: { icon: 'arrowUp', color: '#c14860', bg: 'var(--red-soft)' },
  voucher_activation: { icon: 'gift', color: '#b06a00', bg: 'var(--orange-soft)' },
  training: { icon: 'book', color: 'var(--brand)', bg: 'var(--brand-soft)' },
};

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const { user, refresh } = useAuth();
  const { promptActivation } = useOutletContext() || {};
  const { data, loading, error, stale, reload } = useResource('/dashboard');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  useAutoRefreshOnReconnect(reload);

  if (loading && !data) return <PageSkeleton label="Loading your dashboard" cards={2} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} title="Your dashboard did not load" />;
  if (!data) return null;

  const active = data.user.status === 'active';
  const percent = data.progress.percent;

  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <h1 className="page-title">{greetingFor(data.user.username)}</h1>
          <p>{nairobiDayLabel()} · Here is how your account is doing today.</p>
        </div>
        {!active && (
          <Link to="/app/activate" className="btn btn-activate">
            <Icon name="spark" size={16} /> Activate account
          </Link>
        )}
      </div>

      {stale && <StaleNotice onRetry={reload} />}

      {!active && (
        <div className="banner-inactive" role="status">
          <div className="icon-badge"><Icon name="lock" size={18} /></div>
          <div className="grow">
            <h3>Your account is inactive</h3>
            <p>Activate once with M-Pesa to unlock videos, tasks, affiliate marketing and Sudoku.</p>
          </div>
          <Link to="/app/activate" className="btn btn-activate btn-sm">Activate now</Link>
        </div>
      )}

      <div className="dash-grid">
        <div className="dash-stack">
          <section className="balance-card" aria-label="Wallet balance">
            <span className="balance-label">Available balance</span>
            <div className="balance-value amount">{formatKes(data.wallet.balanceCents)}</div>
            <p className="balance-sub">
              Lifetime earned {formatKes(data.wallet.lifetimeEarnedCents)}
              {data.wallet.pendingWithdrawalCount > 0 && ` · ${data.wallet.pendingWithdrawalCount} withdrawal${data.wallet.pendingWithdrawalCount > 1 ? 's' : ''} pending`}
            </p>
            <div className="balance-actions">
              <button type="button" className="btn btn-white" onClick={() => setWithdrawOpen(true)} disabled={!active}>
                <Icon name="download" size={15} /> Withdraw
              </button>
              <button type="button" className="btn btn-light" onClick={() => setSendOpen(true)} disabled={!active}>
                <Icon name="send" size={15} /> Send money
              </button>
              <Link to="/app/wallet" className="btn btn-light">
                <Icon name="wallet" size={15} /> Wallet
              </Link>
            </div>
            <div className="balance-meta">
              <div><span>Videos</span><strong>{formatKes(data.earnings.videoCents)}</strong></div>
              <div><span>Affiliate</span><strong>{formatKes(data.earnings.affiliateCents)}</strong></div>
              <div><span>Sudoku</span><strong>{formatKes(data.earnings.sudokuCents)}</strong></div>
            </div>
          </section>

          <div className="grid-4 keep">
            <div className="stat-card">
              <div className="stat-label"><Icon name="play" size={13} /> Today&apos;s video</div>
              <div className="stat-value">{data.today.videoPaid ? 'Paid' : 'Not yet'}</div>
              <div className="stat-foot">{data.today.videoPaid ? 'Reward credited' : `${data.today.videoWatchedSeconds}s watched`}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label"><Icon name="grid" size={13} /> Sudoku left</div>
              <div className="stat-value">{data.today.sudokuGamesLeft}</div>
              <div className="stat-foot">of 3 games today</div>
            </div>
            <div className="stat-card">
              <div className="stat-label"><Icon name="users" size={13} /> Referrals</div>
              <div className="stat-value">{data.activityCounts.referrals}</div>
              <div className="stat-foot">Invite more to earn 20%</div>
            </div>
            <div className="stat-card">
              <div className="stat-label"><Icon name="clock" size={13} /> Pending</div>
              <div className="stat-value">{formatKes(data.wallet.pendingWithdrawalCents)}</div>
              <div className="stat-foot">Awaiting approval</div>
            </div>
          </div>

          <section className="card" aria-labelledby="activity-title">
            <div className="card-head">
              <div>
                <h3 id="activity-title">Recent activity</h3>
                <p>Rewards, transfers and withdrawals.</p>
              </div>
              <Link to="/app/wallet" className="link-btn">View wallet</Link>
            </div>
            {data.transactions.length ? (
              <div className="tx-list">
                {data.transactions.map((tx) => {
                  const meta = TX_META[tx.category] || { icon: 'wallet', color: 'var(--brand)', bg: 'var(--brand-soft)' };
                  return (
                    <div className="tx-row" key={tx.id}>
                      <div className="tx-icon" style={{ background: meta.bg, color: meta.color }}>
                        <Icon name={meta.icon} size={15} />
                      </div>
                      <div className="tx-main">
                        <strong>{tx.description}</strong>
                        <span>{timeAgo(tx.created_at)}{tx.status !== 'completed' ? ` · ${tx.status}` : ''}</span>
                      </div>
                      <div className={`tx-amount ${tx.direction === 'credit' ? 'credit' : ''}`}>
                        {tx.direction === 'credit' ? '+' : '−'}{formatKes(tx.amount_cents)}
                        {tx.status !== 'completed' && <small className="muted">{tx.status}</small>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty">
                <div className="empty-icon"><Icon name="wallet" size={20} /></div>
                <p>No activity yet. Watch today&apos;s video to make your first earnings.</p>
                <Link to="/app/videos" className="btn btn-soft btn-sm mt-2">Watch &amp; earn</Link>
              </div>
            )}
          </section>
        </div>

        <div className="dash-stack">
          <section className="card" aria-labelledby="progress-title">
            <div className="card-head">
              <div>
                <h3 id="progress-title">Your setup</h3>
                <p>{data.progress.completed} of {data.progress.total} steps done.</p>
              </div>
            </div>
            <div className="progress-wrap">
              <div className="progress-ring" style={{ '--p': percent }} role="img" aria-label={`${percent}% of setup complete`}>
                <span aria-hidden="true">
                  {percent}%
                  <small aria-hidden="true">complete</small>
                </span>
              </div>
              <div className="progress-steps">
                {data.progress.steps.map((step) => (
                  <div className={`progress-step ${step.done ? 'done' : ''}`} key={step.key}>
                    <span className="tick" aria-hidden="true">{step.done && <Icon name="check" size={11} strokeWidth={3} />}</span>
                    <span>{step.label}</span>
                    <span className="sr-only">{step.done ? 'completed' : 'not completed'}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="card" aria-labelledby="features-title">
            <div className="card-head">
              <div>
                <h3 id="features-title">Earn today</h3>
                <p>Every activity pays into your wallet.</p>
              </div>
            </div>
            <div className="feature-grid">
              {FEATURES.map((feature) => {
                const inner = (
                  <>
                    {!active && <span className="lock-tag"><Icon name="lock" size={10} /> Locked</span>}
                    <span className="feat-icon" style={{ background: feature.bg, color: feature.color }}>
                      <Icon name={feature.icon} size={18} />
                    </span>
                    <div>
                      <h4>{feature.label}</h4>
                      <p>{feature.desc}</p>
                    </div>
                  </>
                );
                return active ? (
                  <Link key={feature.key} to={feature.path} className="feature-tile">{inner}</Link>
                ) : (
                  <button
                    key={feature.key}
                    type="button"
                    className="feature-tile locked"
                    onClick={() => promptActivation?.(feature)}
                  >
                    {inner}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card" aria-labelledby="grow-more-title">
            <div className="card-head">
              <div>
                <h3 id="grow-more-title">Grow beyond daily tasks</h3>
                <p>Learn a skill or compete on the monthly leaderboard.</p>
              </div>
            </div>
            <div className="stack-sm">
              <Link to="/app/training" className="feature-tile" style={{ minHeight: 0, flexDirection: 'row', alignItems: 'center' }}>
                <span className="feat-icon" style={{ background: 'var(--brand-soft)', color: 'var(--brand)', width: 36, height: 36 }}>
                  <Icon name="book" size={17} />
                </span>
                <div className="grow">
                  <h4>Training Academy</h4>
                  <p>Cyber security, web development and penetration testing from KSh 1,200.</p>
                </div>
                <Icon name="chevronRight" size={15} />
              </Link>
              <Link to="/app/leaderboard" className="feature-tile" style={{ minHeight: 0, flexDirection: 'row', alignItems: 'center' }}>
                <span className="feat-icon" style={{ background: 'var(--orange-soft)', color: '#b06a00', width: 36, height: 36 }}>
                  <Icon name="trophy" size={17} />
                </span>
                <div className="grow">
                  <h4>Withdrawal leaderboard</h4>
                  <p>See your rank and the monthly KSh 1,000 voucher prize.</p>
                </div>
                <Icon name="chevronRight" size={15} />
              </Link>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h3>Today&apos;s video</h3>
                <p>{data.today.videoTitle || 'A new video is released each day.'}</p>
              </div>
            </div>
            {data.today.videoPaid ? (
              <div className="celebration-note">
                <Icon name="checkCircle" size={16} />
                You watched today&apos;s video in full. Come back tomorrow for the next one.
              </div>
            ) : (
              <Link to="/app/videos" className="btn btn-primary btn-block">
                <Icon name="play" size={15} /> {data.today.videoWatchedSeconds > 0 ? 'Continue watching' : 'Watch and earn'}
              </Link>
            )}
          </section>
        </div>
      </div>

      <WithdrawModal open={withdrawOpen} onClose={() => setWithdrawOpen(false)} onSubmitted={() => { setWithdrawOpen(false); reload(); refresh(); }} />
      <SendMoneyModal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        onSent={() => { setSendOpen(false); reload(); }}
        balanceCents={data.wallet.balanceCents}
        ownId={data.user.publicId}
      />
    </div>
  );
}
