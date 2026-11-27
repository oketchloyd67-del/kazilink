import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context.jsx';
import { formatKes } from '../lib.js';
import { useDocumentTitle, useResource } from '../hooks.js';
import {
  ErrorState, Icon, PageSkeleton, Spinner, StaleNotice, useToast,
} from '../components/ui.jsx';

function monthLabel(period) {
  if (!period) return '';
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
}

export default function Leaderboard() {
  useDocumentTitle('Withdrawal leaderboard');
  const { user, refresh } = useAuth();
  const { push } = useToast();
  const { data, loading, error, stale, reload } = useResource('/leaderboard');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');

  if (loading && !data) return <PageSkeleton label="Loading the leaderboard" cards={2} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} title="The leaderboard did not load" />;
  if (!data) return null;

  const active = user?.status === 'active';
  const myRank = data.me?.rank;

  const claim = async () => {
    setClaiming(true);
    setClaimError('');
    try {
      const result = await api('/leaderboard/claim', { method: 'POST' });
      push(result.message, 'success', 9000);
      reload();
      refresh();
    } catch (err) {
      setClaimError(err.message);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <h1 className="page-title">Withdrawal leaderboard</h1>
          <p>Approved withdrawals for {monthLabel(data.period)}. Rankings update as requests are approved.</p>
        </div>
        <Link to="/app/wallet" className="btn btn-ghost btn-sm"><Icon name="wallet" size={14} /> My wallet</Link>
      </div>

      {stale && <StaleNotice onRetry={reload} />}

      <section className="leader-hero">
        <div className="leader-hero-copy">
          <span className="eyebrow" style={{ color: 'rgba(255,255,255,.72)' }}>Monthly prize</span>
          <h2>Top withdrawer wins a {formatKes(data.prize.voucherCents)} voucher</h2>
          <p>{data.prize.description}</p>
          <div className="leader-hero-actions">
            <span className="leader-rank-chip">
              <Icon name="trophy" size={16} />
              {myRank ? `You are #${myRank} this month` : 'No approved withdrawals yet'}
            </span>
            {data.myVoucher && (
              <span className="leader-rank-chip"><Icon name="gift" size={16} /> Voucher {data.myVoucher.code}</span>
            )}
          </div>
        </div>
        <div className="leader-podium">
          {data.top.slice(0, 3).map((row, index) => (
            <div className={`podium-item rank-${index + 1}`} key={row.username}>
              <span className="podium-rank">{index + 1}</span>
              <div className="avatar sm">{row.name.slice(0, 1).toUpperCase()}</div>
              <strong>@{row.username}</strong>
              <span>{formatKes(row.totalCents)}</span>
            </div>
          ))}
          {!data.top.length && <p className="tiny" style={{ color: 'rgba(255,255,255,.7)' }}>The first approved withdrawal this month takes the lead.</p>}
        </div>
      </section>

      <div className="dash-grid mt-3">
        <section className="card" aria-labelledby="table-title">
          <div className="card-head">
            <div>
              <h3 id="table-title">This month’s standings</h3>
              <p>Top {Math.min(10, data.top.length) || 10} members by approved withdrawals.</p>
            </div>
          </div>
          {data.top.length ? (
            <div className="leader-table">
              {data.top.map((row) => (
                <div className={`leader-row ${row.rank <= 3 ? `top-${row.rank}` : ''} ${row.username === user?.username ? 'me' : ''}`} key={row.username}>
                  <span className="leader-pos">{row.rank === 1 ? <Icon name="trophy" size={16} /> : row.rank}</span>
                  <div className="avatar sm">{row.name.slice(0, 1).toUpperCase()}</div>
                  <div className="leader-name">
                    <strong>{row.name}</strong>
                    <span>@{row.username}{row.username === user?.username ? ' · You' : ''}</span>
                  </div>
                  <div className="leader-total">
                    {formatKes(row.totalCents)}
                    <small>{row.withdrawals} withdrawal{row.withdrawals === 1 ? '' : 's'}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <div className="empty-icon"><Icon name="trophy" size={20} /></div>
              <p>No approved withdrawals this month yet. Approved payouts will appear here automatically.</p>
              <Link to="/app/wallet" className="btn btn-soft btn-sm mt-2">Open wallet</Link>
            </div>
          )}
          {myRank > 10 && (
            <div className="mini-note mt-2">
              You are ranked #{myRank} this month with {formatKes(data.me.totalCents)} in approved withdrawals. Keep going.
            </div>
          )}
        </section>

        <div className="dash-stack">
          <section className="card" aria-labelledby="prize-title">
            <div className="card-head">
              <div>
                <h3 id="prize-title">Prize and claim</h3>
                <p>Last month: {monthLabel(data.lastPeriod)}</p>
              </div>
              <span className="id-chip"><Icon name="gift" size={11} /> Voucher</span>
            </div>
            {data.previousWinner ? (
              <>
                <div className="ref-stat"><span>Last month’s top withdrawer</span><strong>@{data.previousWinner.username}</strong></div>
                <div className="ref-stat"><span>Approved withdrawals</span><strong>{formatKes(data.previousWinner.totalCents)}</strong></div>
                <div className="ref-stat"><span>Voucher value</span><strong>{formatKes(data.prize.voucherCents)}</strong></div>
                <div className="ref-stat"><span>Claim activation</span><strong>{formatKes(data.prize.claimFeeCents)}</strong></div>
              </>
            ) : (
              <p className="small muted">The previous month had no approved withdrawals, so no voucher winner is recorded yet.</p>
            )}

            {data.myVoucher ? (
              <div className="voucher-card mt-3">
                <span>Your voucher</span>
                <strong>{data.myVoucher.code}</strong>
                <p>{formatKes(data.myVoucher.amountCents)} · {data.myVoucher.status} · expires {new Date(data.myVoucher.expiresAt).toLocaleDateString('en-KE')}</p>
              </div>
            ) : data.canClaim ? (
              <div className="mt-3">
                <div className="mini-note">
                  You topped {monthLabel(data.lastPeriod)}. Activate your {formatKes(data.prize.voucherCents)} voucher with the {formatKes(data.prize.claimFeeCents)} activation fee from your wallet.
                  Your current balance is {formatKes(data.walletBalanceCents)}.
                </div>
                {claimError && <div className="mini-note warn mt-2" role="alert">{claimError}</div>}
                <button type="button" className="btn btn-primary btn-block mt-2" onClick={claim} disabled={claiming}>
                  {claiming ? <><Spinner small label="Activating voucher" /> Activating…</> : `Activate voucher · ${formatKes(data.prize.claimFeeCents)}`}
                </button>
              </div>
            ) : !active ? (
              <div className="mini-note warn mt-3">
                <Icon name="lock" size={13} /> Activate your account to claim a leaderboard voucher. <Link to="/app/activate" className="link-btn">Activate now</Link>
              </div>
            ) : (
              <p className="tiny muted mt-3">Only the previous month’s top withdrawer can claim the voucher. Rankings reset on the first day of each month.</p>
            )}
          </section>

          <section className="card">
            <h3 className="section-title">How ranking works</h3>
            <ul className="rules-list mt-2">
              <li><Icon name="check" size={13} />Only approved withdrawals count toward the leaderboard.</li>
              <li><Icon name="check" size={13} />Pending or cancelled requests do not count.</li>
              <li><Icon name="check" size={13} />The leaderboard resets at the start of each month.</li>
              <li><Icon name="check" size={13} />Voucher claims require an active account and the {formatKes(data.prize.claimFeeCents)} activation fee.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
