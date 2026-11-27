import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatKes, timeAgo } from '../lib.js';
import { useAutoRefreshOnReconnect, useDocumentTitle, useResource } from '../hooks.js';
import { useAuth } from '../context.jsx';
import {
  ErrorState, Icon, PageSkeleton, StaleNotice, StatusPill, WithdrawModal,
} from '../components/ui.jsx';
import SendMoneyModal from '../components/SendMoney.jsx';
import CryptoWithdrawModal from '../components/CryptoWithdraw.jsx';

const BUCKET_STYLE = {
  affiliate: { icon: 'users', color: '#c07a10', bg: '#fff4e2' },
  videos: { icon: 'play', color: 'var(--brand)', bg: 'var(--brand-soft)' },
  status: { icon: 'share', color: '#0f9b6c', bg: 'var(--green-soft)' },
  sudoku: { icon: 'grid', color: '#c14860', bg: '#fdeef1' },
  wallet: { icon: 'wallet', color: '#3b6ea8', bg: '#eaf2fb' },
};

const TX_META = {
  video: { icon: 'play' },
  video_task: { icon: 'checkCircle' },
  affiliate: { icon: 'users' },
  status: { icon: 'share' },
  sudoku: { icon: 'grid' },
  withdrawal: { icon: 'download' },
  withdrawal_refund: { icon: 'refresh' },
  p2p_in: { icon: 'arrowDown' },
  p2p_out: { icon: 'arrowUp' },
  bonus: { icon: 'gift' },
  adjustment: { icon: 'refresh' },
};

export default function Wallet() {
  useDocumentTitle('Wallet');
  const { user, refresh } = useAuth();
  const { data, loading, error, stale, reload } = useResource('/wallet');
  const [tab, setTab] = useState('transactions');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [bucket, setBucket] = useState('wallet');
  const [sendOpen, setSendOpen] = useState(false);
  const [cryptoOpen, setCryptoOpen] = useState(false);
  useAutoRefreshOnReconnect(reload);

  if (loading && !data) return <PageSkeleton label="Loading your wallet" cards={2} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} title="Your wallet did not load" />;
  if (!data) return null;

  const active = user?.status === 'active';

  const openWithdraw = (key) => {
    setBucket(key);
    setWithdrawOpen(true);
  };

  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <h1 className="page-title">Wallet</h1>
          <p>Your balance, earnings buckets and payout history.</p>
        </div>
        <div className="row wrap">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSendOpen(true)} disabled={!active}>
            <Icon name="send" size={14} /> Send money
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCryptoOpen(true)} disabled={!active}>
            <Icon name="globe" size={14} /> Crypto wallet
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => openWithdraw('wallet')} disabled={!active}>
            <Icon name="download" size={14} /> Withdraw
          </button>
        </div>
      </div>

      {!active && (
        <div className="banner-inactive" role="status">
          <div className="icon-badge"><Icon name="lock" size={18} /></div>
          <div className="grow">
            <h3>Withdrawals are locked</h3>
            <p>Activate your account once to withdraw to M-Pesa or a crypto wallet. Your balance stays safe.</p>
          </div>
          <Link to="/app/activate" className="btn btn-activate btn-sm">Activate now</Link>
        </div>
      )}

      {stale && <StaleNotice onRetry={reload} />}

      <section className="balance-card" aria-label="Wallet balance">
        <span className="balance-label">Available balance</span>
        <div className="balance-value amount">{formatKes(data.balanceCents)}</div>
        <p className="balance-sub">Lifetime earned {formatKes(data.lifetimeEarnedCents)} · paid to M-Pesa after approval.</p>
        <div className="balance-actions">
          <button type="button" className="btn btn-white" onClick={() => openWithdraw('wallet')} disabled={!active}>
            <Icon name="download" size={15} /> Withdraw
          </button>
          <button type="button" className="btn btn-light" onClick={() => setSendOpen(true)} disabled={!active}>
            <Icon name="send" size={15} /> Send to a member
          </button>
          <button type="button" className="btn btn-light" onClick={() => setCryptoOpen(true)} disabled={!active}>
            <Icon name="globe" size={15} /> Crypto withdrawal
          </button>
        </div>
      </section>

      <section className="card mt-3" aria-labelledby="buckets-title">
        <div className="card-head">
          <div>
            <h3 id="buckets-title">Earnings by activity</h3>
            <p>Each activity has its own withdrawal rules.</p>
          </div>
        </div>
        <div>
          {data.buckets.map((item) => {
            const style = BUCKET_STYLE[item.key] || BUCKET_STYLE.wallet;
            return (
              <div className="bucket-row" key={item.key}>
                <span className="bucket-icon" style={{ background: style.bg, color: style.color }}>
                  <Icon name={style.icon} size={16} />
                </span>
                <div className="bucket-main">
                  <strong>{item.label}</strong>
                  <span>
                    Min {formatKes(item.minCents, { decimals: false })} · max {formatKes(item.maxCents, { decimals: false })}/day
                  </span>
                </div>
                <div className="bucket-amount">
                  {formatKes(item.availableCents)}
                  <small>{item.canWithdraw ? 'Ready' : 'Below minimum'}</small>
                </div>
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={() => openWithdraw(item.key)}
                  disabled={!item.canWithdraw || !active}
                  aria-label={`Withdraw from ${item.label}`}
                >
                  Withdraw
                </button>
              </div>
            );
          })}
        </div>
        <div className="mini-note mt-3">
          Withdrawals are reviewed by an admin. Requested funds are reserved while pending and returned automatically if rejected.
        </div>
      </section>

      <div className="row-between mt-3 wrap">
        <div className="tabs" role="group" aria-label="Wallet history">
          <button
            type="button"
            className={`tab ${tab === 'transactions' ? 'active' : ''}`}
            aria-pressed={tab === 'transactions'}
            onClick={() => setTab('transactions')}
          >
            Transactions
          </button>
          <button
            type="button"
            className={`tab ${tab === 'withdrawals' ? 'active' : ''}`}
            aria-pressed={tab === 'withdrawals'}
            onClick={() => setTab('withdrawals')}
          >
            Withdrawals ({data.withdrawals.length})
          </button>
        </div>
        <span className="tiny muted">Showing the latest activity</span>
      </div>

      <section className="card mt-2" aria-label={tab === 'transactions' ? 'Transactions' : 'Withdrawals'}>
        {tab === 'transactions' ? (
          data.transactions.length ? (
            <div className="tx-list">
              {data.transactions.map((tx) => (
                <div className="tx-row" key={tx.id}>
                  <div
                    className="tx-icon"
                    style={{
                      background: tx.direction === 'credit' ? 'var(--green-soft)' : 'var(--red-soft)',
                      color: tx.direction === 'credit' ? 'var(--green)' : 'var(--red)',
                    }}
                  >
                    <Icon name={(TX_META[tx.category] || { icon: 'wallet' }).icon} size={15} />
                  </div>
                  <div className="tx-main">
                    <strong>{tx.description}</strong>
                    <span>{timeAgo(tx.created_at)}{tx.status !== 'completed' ? ` · ${tx.status}` : ''}</span>
                  </div>
                  <div className={`tx-amount ${tx.direction === 'credit' ? 'credit' : ''}`}>
                    {tx.direction === 'credit' ? '+' : '−'}{formatKes(tx.amount_cents)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <div className="empty-icon"><Icon name="wallet" size={20} /></div>
              <p>No transactions yet. Earn your first reward to see it here.</p>
            </div>
          )
        ) : data.withdrawals.length ? (
          <div className="tx-list">
            {data.withdrawals.map((item) => (
              <div className="tx-row" key={item.id} style={{ alignItems: 'flex-start' }}>
                <div className="tx-icon" style={{ background: 'var(--orange-soft)', color: '#9a5b00' }}>
                  <Icon name="download" size={15} />
                </div>
                <div className="tx-main">
                  <strong>
                    {formatKes(item.amount_cents)} to {item.method === 'crypto' ? `${item.crypto_network}` : item.phone}
                  </strong>
                  <span>
                    {timeAgo(item.created_at)} · {item.method === 'crypto' ? 'Crypto payout' : 'M-Pesa payout'} · {BUCKET_STYLE[item.bucket] ? item.bucket : 'wallet'}
                  </span>
                  {item.method === 'crypto' && item.crypto_address && (
                    <span style={{ display: 'block', marginTop: 3, overflowWrap: 'anywhere' }}>{item.crypto_address}</span>
                  )}
                  {item.admin_note && <span style={{ display: 'block', marginTop: 3 }}>“{item.admin_note}”</span>}
                </div>
                <StatusPill status={item.status} />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <div className="empty-icon"><Icon name="download" size={20} /></div>
            <p>No withdrawals yet. Your payout history will appear here.</p>
          </div>
        )}
      </section>

      <WithdrawModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        presetBucket={bucket}
        onSubmitted={() => { setWithdrawOpen(false); reload(); refresh(); }}
      />
      <SendMoneyModal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        onSent={() => { setSendOpen(false); reload(); }}
        balanceCents={data.balanceCents}
        ownId={user?.publicId}
      />
      <CryptoWithdrawModal
        open={cryptoOpen}
        onClose={() => setCryptoOpen(false)}
        onSubmitted={() => { setCryptoOpen(false); reload(); refresh(); }}
        balanceCents={data.balanceCents}
      />
    </div>
  );
}
