import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatKes, timeAgo } from '../lib.js';
import { useAutoRefreshOnReconnect, useDocumentTitle, useResource } from '../hooks.js';
import {
  CopyButton, ErrorState, Icon, PageSkeleton, StaleNotice, StatusPill, WithdrawModal, useToast,
} from '../components/ui.jsx';

export default function Affiliate() {
  useDocumentTitle('Affiliate marketing');
  const { data, loading, error, stale, reload } = useResource('/affiliate');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const { push } = useToast();
  useAutoRefreshOnReconnect(reload);

  if (loading && !data) return <PageSkeleton label="Loading your referral link" cards={2} />;
  if (error && !data) {
    return (
      <div className="page-body">
        <ErrorState error={error} onRetry={reload} title="Your affiliate details did not load" />
        {error.status === 403 && <div className="center mt-2"><Link to="/app/activate" className="btn btn-activate">Activate your account</Link></div>}
      </div>
    );
  }
  if (!data) return null;

  const share = async () => {
    const text = `Join me on KaziLink and earn from your phone. Use my code ${data.referralCode}.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'KaziLink', text, url: data.referralLink });
      } else {
        await navigator.clipboard.writeText(`${text} ${data.referralLink}`);
        push('Invite copied. Paste it in WhatsApp or SMS.', 'success');
      }
    } catch {
    }
  };

  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <h1 className="page-title">Affiliate marketing</h1>
          <p>Invite friends. Earn {data.commissionPercent}% when they activate.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setWithdrawOpen(true)}
          disabled={!data.withdrawal?.canWithdraw}
        >
          <Icon name="download" size={15} /> Withdraw commission
        </button>
      </div>

      {stale && <StaleNotice onRetry={reload} />}

      <section className="referral-hero" aria-labelledby="ref-title">
        <span className="eyebrow" style={{ color: 'rgba(255,255,255,.7)' }}>Your referral code</span>
        <h2 id="ref-title" className="mt-2">{data.referralCode}</h2>
        <p>Share your link. When a friend activates their account, {data.commissionPercent}% of their fee lands in your wallet immediately.</p>

        <div className="copy-field mt-3">
          <code>{data.referralLink}</code>
          <CopyButton text={data.referralLink} label="Copy link" small />
        </div>

        <div className="row wrap mt-3">
          <button type="button" className="btn" style={{ background: '#fff', color: '#2a1a66' }} onClick={share}>
            <Icon name="share" size={15} /> Share invite
          </button>
          <CopyButton text={data.referralCode} label="Copy code" small />
        </div>

        <div className="balance-meta" style={{ borderColor: 'rgba(255,255,255,.18)' }}>
          <div><span>Commission earned</span><strong>{formatKes(data.totals.commissionCents)}</strong></div>
          <div><span>Activations</span><strong>{data.totals.activations}</strong></div>
          <div><span>Members invited</span><strong>{data.referrals.length}</strong></div>
        </div>
      </section>

      <div className="grid-2 mt-3">
        <section className="card" aria-labelledby="ref-withdraw-title">
          <div className="card-head">
            <div>
              <h3 id="ref-withdraw-title">Withdrawable commission</h3>
              <p>Minimum {formatKes(data.withdrawal?.minCents || 25000)} · daily max {formatKes(data.withdrawal?.maxCents || 150000, { decimals: false })}</p>
            </div>
          </div>
          <div className="stat-value">{formatKes(data.withdrawal?.availableCents || 0)}</div>
          <p className="stat-foot">Available from affiliate earnings right now.</p>
          <button
            type="button"
            className="btn btn-primary btn-block mt-3"
            onClick={() => setWithdrawOpen(true)}
            disabled={!data.withdrawal?.canWithdraw}
          >
            {data.withdrawal?.canWithdraw ? 'Request withdrawal' : 'Keep inviting to reach the minimum'}
          </button>
        </section>

        <section className="card" aria-labelledby="ref-how-title">
          <div className="card-head">
            <div>
              <h3 id="ref-how-title">How it works</h3>
              <p>Three simple steps.</p>
            </div>
          </div>
          <ul className="rules-list">
            <li><Icon name="share" size={14} />Share your referral link with friends on WhatsApp, X or SMS.</li>
            <li><Icon name="user" size={14} />They sign up with your link and activate once with M-Pesa.</li>
            <li><Icon name="wallet" size={14} />{data.commissionPercent}% commission is credited instantly — withdraw once you reach KSh 250.</li>
          </ul>
        </section>
      </div>

      <section className="card mt-3" aria-labelledby="ref-list-title">
        <div className="card-head">
          <div>
            <h3 id="ref-list-title">People you invited</h3>
            <p>Commissions are paid per successful activation.</p>
          </div>
        </div>
        {data.referrals.length ? (
          <div className="tx-list">
            {data.referrals.map((referral) => (
              <div className="tx-row" key={referral.publicId}>
                <div className="tx-icon" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
                  <Icon name="user" size={15} />
                </div>
                <div className="tx-main">
                  <strong>{referral.firstName} · @{referral.username}</strong>
                  <span>Joined {timeAgo(referral.joinedAt)}</span>
                </div>
                <StatusPill status={referral.status} />
                <span className={`tx-amount ${referral.commissionCents ? 'credit' : 'muted'}`}>
                  {referral.commissionCents ? `+${formatKes(referral.commissionCents)}` : '—'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <div className="empty-icon"><Icon name="users" size={20} /></div>
            <p>No invites yet. Share your link to start earning commission.</p>
            <button type="button" className="btn btn-soft btn-sm mt-2" onClick={share}>Share your invite</button>
          </div>
        )}
      </section>

      <WithdrawModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        presetBucket="affiliate"
        onSubmitted={() => { setWithdrawOpen(false); reload(); }}
      />
    </div>
  );
}
