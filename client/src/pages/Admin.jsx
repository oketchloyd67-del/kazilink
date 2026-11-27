import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context.jsx';
import { formatKes, timeAgo } from '../lib.js';
import { useDocumentTitle, useResource } from '../hooks.js';
import {
  BootSkeleton, ErrorState, Field, Icon, Modal, Spinner, StatusPill, useToast,
} from '../components/ui.jsx';
import ChangePassword from '../components/ChangePassword.jsx';

const NAV = [
  { key: 'overview', label: 'Overview', icon: 'home' },
  { key: 'users', label: 'Users', icon: 'users' },
  { key: 'withdrawals', label: 'Withdrawals', icon: 'download' },
  { key: 'submissions', label: 'Submissions', icon: 'checkCircle' },
  { key: 'payments', label: 'Payments', icon: 'wallet' },
  { key: 'training', label: 'Training', icon: 'book' },
  { key: 'support', label: 'Support', icon: 'message' },
  { key: 'sudoku', label: 'Sudoku', icon: 'grid' },
  { key: 'account', label: 'Account', icon: 'shield' },
];

function AdminLogin() {
  const { login } = useAuth();
  const { push } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api('/auth/admin/login', { method: 'POST', body: { email, password } });
      login(data.user);
      push('Admin console unlocked.', 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main id="main" className="admin-login">
      <form className="auth-card" onSubmit={submit} style={{ width: 'min(420px, 100%)' }}>
        <div className="brand-lockup">
          <img src="/img/logo.png" alt="" width="32" height="32" />
          KaziLink
        </div>
        <div className="auth-head">
          <h1 className="page-title">Admin console</h1>
          <p>Staff access only. All actions are logged.</p>
        </div>
        {error && <div className="mini-note warn mb-2" role="alert">{error}</div>}
        <div className="auth-form">
          <Field label="Admin email">
            <input
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>
            {loading ? <><Spinner small label="Signing in" /> Signing in…</> : 'Sign in'}
          </button>
        </div>
      </form>
    </main>
  );
}

function TableState({ loading, error, reload, empty, children }) {
  if (loading) {
    return (
      <div className="center" style={{ padding: 28 }} role="status" aria-live="polite">
        <Spinner label="Loading records" />
        <p className="tiny muted mt-2">Loading…</p>
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} title="Records did not load" />;
  if (empty) return <div className="empty"><p>Nothing here right now.</p></div>;
  return children;
}

export default function Admin() {
  useDocumentTitle('Admin');
  const { user, loading, logout } = useAuth();
  if (loading) return <BootSkeleton />;
  if (!user || user.role !== 'admin') return <AdminLogin />;
  return <Console admin={user} onLogout={logout} />;
}

function Console({ admin, onLogout }) {
  const { push } = useToast();
  const [tab, setTab] = useState('overview');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [userStatus, setUserStatus] = useState('all');
  const [wdStatus, setWdStatus] = useState('pending');
  const [subType, setSubType] = useState('tasks');
  const [subStatus, setSubStatus] = useState('pending');
  const [busy, setBusy] = useState('');
  const [review, setReview] = useState(null);
  const [note, setNote] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [userDetail, setUserDetail] = useState(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [userDetailError, setUserDetailError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState('all');
  const [trainingCancel, setTrainingCancel] = useState(null);
  const [trainingReason, setTrainingReason] = useState('');
  const [trainingBusy, setTrainingBusy] = useState(false);
  const [trainingDelete, setTrainingDelete] = useState(null);
  const [tumaBaseUrl, setTumaBaseUrl] = useState('');
  const [tumaApiKey, setTumaApiKey] = useState('');
  const [tumaAccountId, setTumaAccountId] = useState('');
  const [tumaBusy, setTumaBusy] = useState(false);
  const [tumaStatus, setTumaStatus] = useState(null);
  const [supportStatus, setSupportStatus] = useState('open');
  const [supportReply, setSupportReply] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState('');
  const [ticketDelete, setTicketDelete] = useState(null);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const stats = useResource('/admin/stats', { enabled: tab === 'overview' });
  const users = useResource(`/admin/users?q=${encodeURIComponent(search)}&status=${userStatus}`, { enabled: tab === 'users' });
  const withdrawals = useResource(`/admin/withdrawals?status=${wdStatus}`, { enabled: tab === 'withdrawals' });
  const submissions = useResource(`/admin/submissions?type=${subType}&status=${subStatus}`, { enabled: tab === 'submissions' });
  const payments = useResource('/admin/payments', { enabled: tab === 'payments' });
  const sudoku = useResource('/admin/sudoku', { enabled: tab === 'sudoku' });
  const training = useResource(`/admin/training?status=${trainingStatus}`, { enabled: tab === 'training' });
  const support = useResource(`/admin/support?status=${supportStatus}`, { enabled: tab === 'support' });

  const act = async (key, request, successMessage, reload) => {
    setBusy(key);
    try {
      await request();
      push(successMessage, 'success');
      reload?.();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const runUserAction = (id, action) => act(
    `user-${id}-${action}`,
    () => api(`/admin/users/${id}/action`, { method: 'POST', body: { action } }),
    `User ${action}d.`,
    () => { users.reload(); if (userDetail?.user?.id === id) openUser(id); },
  );

  const openUser = async (id) => {
    setUserDetailLoading(true);
    setUserDetailError('');
    setUserDetail({ user: null });
    try {
      const data = await api(`/admin/users/${id}`);
      setUserDetail(data);
    } catch (error) {
      setUserDetailError(error.message);
    } finally {
      setUserDetailLoading(false);
    }
  };

  const notifyInactive = async () => {
    setNotifyBusy(true);
    try {
      const data = await api('/admin/users/notify-inactive', { method: 'POST', body: { hours: 24 } });
      push(data.message, 'success', 7000);
      users.reload();
    } catch (error) {
      push(error.message, 'error');
    } finally {
      setNotifyBusy(false);
    }
  };

  const removeUser = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      const data = await api(`/admin/users/${deleteTarget.id}`, { method: 'DELETE' });
      push(data.message, 'success', 7000);
      setDeleteTarget(null);
      setUserDetail(null);
      users.reload();
      stats.reload();
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const cancelEnrollment = async (event) => {
    event?.preventDefault();
    if (!trainingCancel) return;
    setTrainingBusy(true);
    try {
      await api(`/admin/training/${trainingCancel.id}/cancel`, { method: 'POST', body: { reason: trainingReason } });
      push('Enrollment cancelled. The member was notified.', 'success');
      setTrainingCancel(null);
      setTrainingReason('');
      training.reload();
    } catch (error) {
      push(error.message, 'error');
    } finally {
      setTrainingBusy(false);
    }
  };

  const deleteEnrollment = async () => {
    if (!trainingDelete) return;
    setTrainingBusy(true);
    try {
      await api(`/admin/training/${trainingDelete.id}`, { method: 'DELETE' });
      push('Enrollment record deleted.', 'success');
      setTrainingDelete(null);
      training.reload();
    } catch (error) {
      push(error.message, 'error');
    } finally {
      setTrainingBusy(false);
    }
  };

  const sendReply = async (event) => {
    event.preventDefault();
    if (!supportReply) return;
    setReplyBusy(true);
    setReplyError('');
    try {
      await api(`/admin/support/${supportReply.id}/reply`, { method: 'POST', body: { reply: replyText } });
      push('Reply sent to the member.', 'success');
      setSupportReply(null);
      setReplyText('');
      support.reload();
    } catch (error) {
      setReplyError(error.message);
    } finally {
      setReplyBusy(false);
    }
  };

  const resolveTicket = async (ticket) => {
    setBusy(`ticket-${ticket.id}`);
    try {
      await api(`/admin/support/${ticket.id}/resolve`, { method: 'POST' });
      push('Request marked resolved.', 'success');
      support.reload();
    } catch (error) {
      push(error.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const removeTicket = async () => {
    if (!ticketDelete) return;
    setBusy(`ticket-${ticketDelete.id}`);
    try {
      await api(`/admin/support/${ticketDelete.id}`, { method: 'DELETE' });
      push('Support request deleted.', 'success');
      setTicketDelete(null);
      support.reload();
    } catch (error) {
      push(error.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const saveTuma = async () => {
    setTumaBusy(true);
    setTumaStatus(null);
    try {
      await api('/admin/settings/tuma', { method: 'PUT', body: { baseUrl: tumaBaseUrl, apiKey: tumaApiKey, accountId: tumaAccountId } });
      setTumaStatus({ ok: true });
      setTumaBusy(false);
      push('Tuma credentials saved.', 'success', 6000);
    } catch (err) {
      setTumaStatus({ error: err.message });
      setTumaBusy(false);
      push(err.message, 'error', 7000);
    }
  };

  const clearTuma = () => {
    setTumaBaseUrl('');
    setTumaApiKey('');
    setTumaAccountId('');
    setTumaStatus(null);
  };

  const openReview = (kind, item, action) => {
    setNote('');
    setReviewError('');
    const cancelling = kind === 'withdrawal' && action === 'reject';
    setReview({
      kind,
      id: item.id,
      action,
      title: action === 'approve'
        ? `Approve ${kind === 'withdrawal' ? 'withdrawal' : 'submission'}`
        : cancelling ? 'Cancel withdrawal request' : 'Reject submission',
      amountCents: item.amount_cents,
    });
  };

  const submitReview = async (event) => {
    event?.preventDefault();
    if (!review) return;
    setReviewBusy(true);
    setReviewError('');
    const base = review.kind === 'withdrawal'
      ? `/admin/withdrawals/${review.id}/review`
      : review.kind === 'task'
        ? `/admin/submissions/tasks/${review.id}/review`
        : `/admin/submissions/status/${review.id}/review`;
    try {
      await api(base, { method: 'POST', body: { action: review.action, note } });
      push(
        review.action === 'approve'
          ? 'Request approved.'
          : review.kind === 'withdrawal' ? 'Withdrawal cancelled and funds returned.' : 'Submission rejected.',
        'success',
      );
      setReview(null);
      if (review.kind === 'withdrawal') withdrawals.reload();
      else submissions.reload();
    } catch (err) {
      setReviewError(err.message);
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="brand-lockup" style={{ color: '#fff' }}>
          <img src="/img/logo.png" alt="" />
          KaziLink
        </div>
        <span className="admin-tag">Admin console</span>
        <nav className="admin-nav" aria-label="Admin sections">
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              className={tab === item.key ? 'active' : ''}
              aria-current={tab === item.key ? 'page' : undefined}
              onClick={() => setTab(item.key)}
            >
              <Icon name={item.icon} size={15} />
              {item.label}
            </button>
          ))}
        </nav>
        <div style={{ marginTop: 'auto' }}>
          <button type="button" className="admin-nav" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.6)', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', fontSize: '.78rem' }} onClick={() => onLogout()}>
            <Icon name="logout" size={14} /> Log out
          </button>
        </div>
      </aside>

      <main id="main" className="admin-main">
        <div className="admin-head">
          <div>
            <h1>{NAV.find((item) => item.key === tab)?.label}</h1>
            <p className="tiny muted">Signed in as {admin.email}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        </div>

        {tab === 'overview' && (
          <TableState loading={stats.loading && !stats.data} error={stats.error && !stats.data} reload={stats.reload} empty={!stats.data}>
            {stats.data && (
              <>
                <div className="admin-stats">
                  <div className="admin-stat"><span>Total users</span><strong>{stats.data.users.total}</strong></div>
                  <div className="admin-stat"><span>Active users</span><strong>{stats.data.users.active}</strong></div>
                  <div className="admin-stat"><span>Pending withdrawals</span><strong>{stats.data.pending.withdrawals}</strong></div>
                  <div className="admin-stat"><span>Pending reviews</span><strong>{stats.data.pending.taskSubmissions + stats.data.pending.statusSubmissions}</strong></div>
                </div>
                <div className="admin-stats">
                  <div className="admin-stat"><span>Activation revenue</span><strong>{formatKes(stats.data.money.activationRevenueCents)}</strong></div>
                  <div className="admin-stat"><span>Training revenue</span><strong>{formatKes(stats.data.money.trainingRevenueCents || 0)}</strong></div>
                  <div className="admin-stat"><span>Sudoku revenue</span><strong>{formatKes(stats.data.money.sudokuRevenueCents)}</strong></div>
                  <div className="admin-stat"><span>Paid out</span><strong>{formatKes(stats.data.money.paidOutCents)}</strong></div>
                </div>
                <div className="admin-stats">
                  <div className="admin-stat"><span>Active enrollments</span><strong>{stats.data.activity?.activeEnrollments || 0}</strong></div>
                  <div className="admin-stat"><span>Open support</span><strong>{stats.data.activity?.openSupport || 0}</strong></div>
                  <div className="admin-stat"><span>Customer balances</span><strong>{formatKes(stats.data.money.customerBalancesCents)}</strong></div>
                  <div className="admin-stat"><span>Inactive accounts</span><strong>{stats.data.users.inactive}</strong></div>
                </div>
                <div className="card">
                  <h2 className="section-title">Needs attention</h2>
                  <p className="small muted mt-1">
                    {stats.data.pending.withdrawals} withdrawals worth {formatKes(stats.data.pending.withdrawalCents)},
                    {' '}{stats.data.pending.taskSubmissions} task screenshots and {stats.data.pending.statusSubmissions} status screenshots are waiting.
                  </p>
                  <div className="row wrap mt-2">
                    <button type="button" className="btn btn-soft btn-sm" onClick={() => setTab('withdrawals')}>Review withdrawals</button>
                    <button type="button" className="btn btn-soft btn-sm" onClick={() => setTab('submissions')}>Review submissions</button>
                  </div>
                </div>
              </>
            )}
          </TableState>
        )}

        {tab === 'users' && (
          <>
            <form
              className="filter-row"
              onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); }}
              role="search"
            >
              <input
                className="input search-input"
                type="search"
                placeholder="Search name, email, phone or ID"
                aria-label="Search users"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="submit" className="btn btn-soft btn-sm"><Icon name="search" size={14} /> Search</button>
              <select className="select" style={{ maxWidth: 170 }} aria-label="Filter by status" value={userStatus} onChange={(event) => setUserStatus(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
              <button type="button" className="btn btn-activate btn-sm" onClick={notifyInactive} disabled={notifyBusy}>
                {notifyBusy ? <><Spinner small label="Sending notices" /> Sending…</> : <><Icon name="bell" size={13} /> Notify inactive · 24h</>}
              </button>
            </form>
            <TableState loading={users.loading && !users.data} error={users.error && !users.data} reload={users.reload} empty={!users.data?.users.length}>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>User</th><th>Contact</th><th>Status</th><th>Balance</th><th>Joined</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {users.data?.users.map((item) => (
                      <tr key={item.id}>
                        <td data-label="User">
                          <div className="table-user">
                            <div className="avatar sm">{`${item.firstName[0] || ''}${item.lastName[0] || ''}`}</div>
                            <div><strong>{item.firstName} {item.lastName}</strong><span>@{item.username} · {item.publicId}</span></div>
                          </div>
                        </td>
                        <td data-label="Contact">{item.email}<br /><span className="muted">{item.phone}</span></td>
                        <td data-label="Status"><StatusPill status={item.status} /></td>
                        <td data-label="Balance">{formatKes(item.balanceCents)}</td>
                        <td data-label="Joined">{timeAgo(item.createdAt)}</td>
                        <td data-label="Actions">
                          <div className="table-actions">
                            <button type="button" className="btn btn-ghost" onClick={() => openUser(item.id)}>View</button>
                            {item.status !== 'active' && (
                              <button type="button" className="btn btn-soft" onClick={() => runUserAction(item.id, 'activate')} disabled={busy === `user-${item.id}-activate`}>
                                {busy === `user-${item.id}-activate` ? <Spinner small /> : 'Activate'}
                              </button>
                            )}
                            {item.status !== 'suspended' && (
                              <button type="button" className="btn btn-danger" onClick={() => runUserAction(item.id, 'suspend')} disabled={busy === `user-${item.id}-suspend`}>Suspend</button>
                            )}
                            {item.status === 'suspended' && (
                              <button type="button" className="btn btn-ghost" onClick={() => runUserAction(item.id, 'reinstate')} disabled={busy === `user-${item.id}-reinstate`}>Reinstate</button>
                            )}
                            <button type="button" className="btn btn-danger" onClick={() => { setDeleteError(''); setDeleteTarget(item); }} aria-label={`Delete account ${item.username}`}>
                              <Icon name="trash" size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableState>
          </>
        )}

        {tab === 'withdrawals' && (
          <>
            <div className="filter-row">
              <select className="select" style={{ maxWidth: 190 }} aria-label="Filter withdrawals" value={wdStatus} onChange={(event) => setWdStatus(event.target.value)}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
            </div>
            <TableState loading={withdrawals.loading && !withdrawals.data} error={withdrawals.error && !withdrawals.data} reload={withdrawals.reload} empty={!withdrawals.data?.withdrawals.length}>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>#</th><th>User</th><th>Amount</th><th>Payout</th><th>Status</th><th>Requested</th><th>Actions</th></tr></thead>
                  <tbody>
                    {withdrawals.data?.withdrawals.map((item) => (
                      <tr key={item.id}>
                        <td data-label="ID">{item.id}</td>
                        <td data-label="User"><strong>{item.first_name} {item.last_name}</strong><br /><span className="muted">@{item.username}</span></td>
                        <td data-label="Amount">{formatKes(item.amount_cents)}<br /><span className="muted tiny">{item.bucket}</span></td>
                        <td data-label="Payout">
                          {item.method === 'crypto' ? (
                            <>
                              <strong>{item.crypto_network}</strong>
                              <br /><span className="muted tiny" style={{ overflowWrap: 'anywhere' }}>{item.crypto_address}</span>
                            </>
                          ) : item.phone}
                        </td>
                        <td data-label="Status"><StatusPill status={item.status} /></td>
                        <td data-label="Requested">{timeAgo(item.created_at)}</td>
                        <td data-label="Actions">
                          {item.status === 'pending' ? (
                            <div className="table-actions">
                              <button type="button" className="btn btn-soft" onClick={() => openReview('withdrawal', item, 'approve')}>Approve</button>
                              <button type="button" className="btn btn-danger" onClick={() => openReview('withdrawal', item, 'reject')}>Cancel request</button>
                            </div>
                          ) : <span className="muted tiny">Reviewed</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableState>
          </>
        )}

        {tab === 'submissions' && (
          <>
            <div className="filter-row">
              <select className="select" style={{ maxWidth: 170 }} aria-label="Submission type" value={subType} onChange={(event) => setSubType(event.target.value)}>
                <option value="tasks">Creator tasks</option>
                <option value="status">Status posts</option>
              </select>
              <select className="select" style={{ maxWidth: 170 }} aria-label="Submission status" value={subStatus} onChange={(event) => setSubStatus(event.target.value)}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <TableState loading={submissions.loading && !submissions.data} error={submissions.error && !submissions.data} reload={submissions.reload} empty={!submissions.data?.submissions.length}>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>User</th><th>Detail</th><th>Reward</th><th>Evidence</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {submissions.data?.submissions.map((item) => (
                      <tr key={item.id}>
                        <td data-label="User"><strong>{item.first_name} {item.last_name}</strong><br /><span className="muted">@{item.username}</span></td>
                        <td data-label="Detail">
                          {subType === 'tasks'
                            ? `${item.task_type} · ${item.creator_handle}`
                            : `${item.product_name} · ${item.viewers} viewers`}
                          {item.comment_text && <div className="tiny muted">“{item.comment_text}”</div>}
                        </td>
                        <td data-label="Reward">{formatKes(item.amount_cents)}</td>
                        <td data-label="Evidence">
                          <a
                            className="btn btn-ghost btn-sm"
                            href={`/api/${subType === 'tasks' ? 'videos' : 'status'}/evidence/${item.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Icon name="eye" size={13} /> View
                          </a>
                        </td>
                        <td data-label="Status"><StatusPill status={item.status} /></td>
                        <td data-label="Actions">
                          {item.status === 'pending' ? (
                            <div className="table-actions">
                              <button type="button" className="btn btn-soft" onClick={() => openReview(subType === 'tasks' ? 'task' : 'status', item, 'approve')}>Approve</button>
                              <button type="button" className="btn btn-danger" onClick={() => openReview(subType === 'tasks' ? 'task' : 'status', item, 'reject')}>Reject</button>
                            </div>
                          ) : <span className="muted tiny">Reviewed</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableState>
          </>
        )}

        {tab === 'payments' && (
          <TableState loading={payments.loading && !payments.data} error={payments.error && !payments.data} reload={payments.reload} empty={!payments.data?.payments.length}>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>#</th><th>User</th><th>Purpose</th><th>Amount</th><th>Phone</th><th>Status</th><th>Created</th></tr></thead>
                <tbody>
                  {payments.data?.payments.map((item) => (
                    <tr key={item.id}>
                      <td data-label="ID">{item.id}</td>
                      <td data-label="User">@{item.username}</td>
                      <td data-label="Purpose">{item.purpose}</td>
                      <td data-label="Amount">{formatKes(item.amount_cents)}</td>
                      <td data-label="Phone">{item.phone}</td>
                      <td data-label="Status"><StatusPill status={item.status} /></td>
                      <td data-label="Created">{timeAgo(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableState>
        )}

        {tab === 'sudoku' && (
          <TableState loading={sudoku.loading && !sudoku.data} error={sudoku.error && !sudoku.data} reload={sudoku.reload} empty={!sudoku.data?.games.length}>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>#</th><th>User</th><th>Fee</th><th>Payout</th><th>Status</th><th>Started</th></tr></thead>
                <tbody>
                  {sudoku.data?.games.map((item) => (
                    <tr key={item.id}>
                      <td data-label="ID">{item.id}</td>
                      <td data-label="User">@{item.username}</td>
                      <td data-label="Fee">{formatKes(item.fee_cents)}</td>
                      <td data-label="Payout">{formatKes(item.payout_cents)}</td>
                      <td data-label="Status"><StatusPill status={item.status} /></td>
                      <td data-label="Started">{timeAgo(item.started_at || item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableState>
        )}

        {tab === 'training' && (
          <>
            <div className="filter-row">
              <select className="select" style={{ maxWidth: 190 }} aria-label="Filter training enrollments" value={trainingStatus} onChange={(event) => setTrainingStatus(event.target.value)}>
                <option value="all">All enrollments</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <TableState loading={training.loading && !training.data} error={training.error && !training.data} reload={training.reload} empty={!training.data?.enrollments.length}>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>#</th><th>Member</th><th>Course</th><th>Status</th><th>Paid</th><th>Term ends</th><th>Actions</th></tr></thead>
                  <tbody>
                    {training.data?.enrollments.map((item) => (
                      <tr key={item.id}>
                        <td data-label="ID">{item.id}</td>
                        <td data-label="Member"><strong>{item.first_name} {item.last_name}</strong><br /><span className="muted">@{item.username}</span></td>
                        <td data-label="Course">{item.course_title}<br /><span className="muted tiny">{formatKes(item.price_cents)} per term</span></td>
                        <td data-label="Status"><StatusPill status={item.status} /></td>
                        <td data-label="Paid">{item.paid_at ? timeAgo(item.paid_at) : 'Not paid'}</td>
                        <td data-label="Term ends">{item.expires_at ? new Date(item.expires_at).toLocaleDateString('en-KE') : '—'}</td>
                        <td data-label="Actions">
                          <div className="table-actions">
                            {item.status !== 'cancelled' && (
                              <button type="button" className="btn btn-danger" onClick={() => { setTrainingReason(''); setTrainingCancel(item); }}>Cancel</button>
                            )}
                            <button type="button" className="btn btn-ghost" onClick={() => setTrainingDelete(item)} aria-label="Delete enrollment record"><Icon name="trash" size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableState>
            {training.data?.payments?.length > 0 && (
              <div className="card mt-3">
                <h2 className="section-title">Recent course payments</h2>
                <div className="tx-list mt-2">
                  {training.data.payments.map((item) => (
                    <div className="tx-row" key={item.id}>
                      <div className="tx-icon" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}><Icon name="book" size={15} /></div>
                      <div className="tx-main"><strong>{item.title}</strong><span>@{item.username} · {timeAgo(item.created_at)}</span></div>
                      <div className="tx-amount">{formatKes(item.amount_cents)}<StatusPill status={item.status} /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'support' && (
          <>
            <div className="filter-row">
              <select className="select" style={{ maxWidth: 190 }} aria-label="Filter support requests" value={supportStatus} onChange={(event) => setSupportStatus(event.target.value)}>
                <option value="open">Open</option>
                <option value="replied">Replied</option>
                <option value="resolved">Resolved</option>
                <option value="all">All requests</option>
              </select>
            </div>
            <TableState loading={support.loading && !support.data} error={support.error && !support.data} reload={support.reload} empty={!support.data?.messages.length}>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>#</th><th>Member</th><th>Request</th><th>Status</th><th>Sent</th><th>Actions</th></tr></thead>
                  <tbody>
                    {support.data?.messages.map((item) => (
                      <tr key={item.id}>
                        <td data-label="ID">{item.id}</td>
                        <td data-label="Member"><strong>{item.first_name} {item.last_name}</strong><br /><span className="muted">@{item.username}</span></td>
                        <td data-label="Request">
                          <strong className="tiny">{item.category}</strong>
                          <div className="small" style={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}>{item.message}</div>
                          {item.admin_reply && <div className="tiny" style={{ color: 'var(--green)', whiteSpace: 'pre-wrap' }}>Reply: {item.admin_reply}</div>}
                        </td>
                        <td data-label="Status"><StatusPill status={item.status} /></td>
                        <td data-label="Sent">{timeAgo(item.created_at)}</td>
                        <td data-label="Actions">
                          <div className="table-actions">
                            <button type="button" className="btn btn-soft" onClick={() => { setReplyText(item.admin_reply || ''); setReplyError(''); setSupportReply(item); }}>Reply</button>
                            {item.status !== 'resolved' && (
                              <button type="button" className="btn btn-ghost" onClick={() => resolveTicket(item)} disabled={busy === `ticket-${item.id}`}>Resolve</button>
                            )}
                            <button type="button" className="btn btn-danger" onClick={() => setTicketDelete(item)} aria-label="Delete support request"><Icon name="trash" size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableState>
          </>
        )}

        {tab === 'account' && (
          <div className="dash-grid">
            <section className="card">
              <div className="card-head">
                <div>
                  <h2 className="section-title">Admin account</h2>
                  <p>Your staff account and security controls.</p>
                </div>
                <StatusPill status="active" />
              </div>
              <div className="kv">
                <div><span>Email</span><strong>{admin.email}</strong></div>
                <div><span>Username</span><strong>@{admin.username}</strong></div>
                <div><span>Role</span><strong>{admin.role}</strong></div>
                <div><span>Member since</span><strong>{admin.createdAt ? new Date(admin.createdAt).toLocaleDateString('en-KE') : '—'}</strong></div>
              </div>
              <div className="row wrap mt-3">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setPasswordOpen(true)}>
                  <Icon name="key" size={14} /> Change admin password
                </button>
              </div>
              <div className="mini-note mt-3">
                Changing the admin password signs out all admin sessions, including this console. Sign in again with the new password.
              </div>
            </section>
            <section className="card">
              <h2 className="section-title">Tuma payment credentials</h2>
              <p className="small muted mt-1">Configure the Tuma payment provider for M-Pesa withdrawals and deposits. Credentials are stored securely and never shown in plain text after saving.</p>
              <div className="stack mt-3">
                <Field label="API base URL" hint="Tuma API endpoint, usually https://api.tuma.example.com">
                  <input className="input" type="url" value={tumaBaseUrl} onChange={(e) => setTumaBaseUrl(e.target.value)} placeholder="https://api.tuma.example.com" />
                </Field>
                <Field label="API key" hint="Your Tuma API key">
                  <input className="input" type="password" value={tumaApiKey} onChange={(e) => setTumaApiKey(e.target.value)} placeholder="••••••••••••••••" />
                </Field>
                <Field label="Account ID" hint="Tuma account identifier">
                  <input className="input" type="text" value={tumaAccountId} onChange={(e) => setTumaAccountId(e.target.value)} placeholder="acct_••••••••••" />
                </Field>
                <div className="row wrap mt-2">
                  <button type="button" className="btn btn-primary btn-sm" onClick={saveTuma} disabled={tumaBusy}>
                    {tumaBusy ? <><Spinner small label="Saving" /> Saving…</> : <><Icon name="check" size={14} /> Save Tuma credentials</>}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={clearTuma} disabled={tumaBusy}>Clear</button>
                </div>
                {tumaStatus && (
                  <div className={`mini-note mt-2 ${tumaStatus.ok ? 'success' : 'warn'}`.replace('success', '').replace('warn', 'warn')} role="alert">
                    {tumaStatus.ok ? 'Tuma credentials saved successfully.' : tumaStatus.error}
                  </div>
                )}
                <div className="mini-note mt-2">
                  When configured, payments are processed through Tuma. The admin <strong>Payments</strong> tab shows all payment records including Tuma transaction references.
                </div>
              </div>
            </section>
            <section className="card">
              <h2 className="section-title">Security notes</h2>
              <ul className="rules-list mt-2">
                <li><Icon name="shield" size={13} />Admin routes are hidden from members and require an admin session.</li>
                <li><Icon name="shield" size={13} />Every withdrawal, refund and deletion is recorded with the reviewing admin.</li>
                <li><Icon name="shield" size={13} />Never share admin credentials. Use a unique password and sign out on shared devices.</li>
              </ul>
            </section>
          </div>
        )}
      </main>

      <Modal
        open={Boolean(review)}
        onClose={reviewBusy ? undefined : () => setReview(null)}
        title={review?.title}
        description={review ? `Amount: ${formatKes(review.amountCents)}. A reason is required when cancelling or rejecting.` : ''}
        size="sm"
        hideClose={reviewBusy}
      >
        <form className="stack" onSubmit={submitReview}>
          {reviewError && <div className="mini-note warn" role="alert">{reviewError}</div>}
          <Field
            label={review?.action === 'reject' ? 'Reason (required)' : 'Note (optional)'}
            hint="Shown to the member in their notification and email."
          >
            <textarea
              className="textarea"
              maxLength={300}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              required={review?.action === 'reject'}
              placeholder={review?.action === 'reject' ? 'Explain why this request is being cancelled.' : 'Optional note for the member.'}
            />
          </Field>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setReview(null)} disabled={reviewBusy}>Cancel</button>
            <button type="submit" className={`btn ${review?.action === 'reject' ? 'btn-danger' : 'btn-primary'}`} disabled={reviewBusy}>
              {reviewBusy ? <><Spinner small label="Saving review" /> Saving…</> : review?.action === 'approve' ? 'Approve request' : review?.kind === 'withdrawal' ? 'Cancel request' : 'Reject submission'}
            </button>
          </div>
          <div className="sr-only" role="status" aria-live="polite">
            {reviewBusy ? 'Saving your review. Please wait.' : ''}
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(userDetail)}
        onClose={userDetailLoading ? undefined : () => setUserDetail(null)}
        title={userDetail?.user ? `${userDetail.user.fullName} · @${userDetail.user.username}` : 'Member details'}
        description="Account, wallet and activity records."
        size="lg"
      >
        {userDetailLoading ? (
          <div className="center" style={{ padding: 24 }} role="status"><Spinner label="Loading member" /></div>
        ) : userDetailError ? (
          <div className="mini-note warn" role="alert">{userDetailError}</div>
        ) : userDetail?.user ? (
          <div className="stack">
            <div className="row-between wrap">
              <div className="row">
                <div className="avatar lg">{userDetail.user.firstName?.[0]}{userDetail.user.lastName?.[0]}</div>
                <div>
                  <strong>{userDetail.user.fullName}</strong>
                  <p className="tiny muted">@{userDetail.user.username} · {userDetail.user.publicId}</p>
                </div>
              </div>
              <StatusPill status={userDetail.user.status} />
            </div>
            <div className="kv">
              <div><span>Email</span><strong>{userDetail.user.email}</strong></div>
              <div><span>Phone</span><strong>{userDetail.user.phone}</strong></div>
              <div><span>Wallet balance</span><strong>{formatKes(userDetail.user.balanceCents)}</strong></div>
              <div><span>Lifetime earned</span><strong>{formatKes(userDetail.user.lifetimeEarnedCents)}</strong></div>
              <div><span>Referred by</span><strong>{userDetail.user.referrer ? `@${userDetail.user.referrer.username}` : 'Direct'}</strong></div>
              <div><span>Joined</span><strong>{timeAgo(userDetail.user.createdAt)}</strong></div>
            </div>
            <div className="grid-3 keep">
              <div className="stat-card"><div className="stat-label">Tasks</div><div className="stat-value">{userDetail.activity.taskSubmissions}</div></div>
              <div className="stat-card"><div className="stat-label">Status posts</div><div className="stat-value">{userDetail.activity.statusSubmissions}</div></div>
              <div className="stat-card"><div className="stat-label">Sudoku games</div><div className="stat-value">{userDetail.activity.sudokuGames}</div></div>
            </div>
            <div>
              <h3 className="small strong">Recent transactions</h3>
              {userDetail.transactions.length ? (
                <div className="tx-list">
                  {userDetail.transactions.slice(0, 8).map((tx) => (
                    <div className="tx-row" key={tx.id}>
                      <div className="tx-main"><strong>{tx.description}</strong><span>{timeAgo(tx.created_at)} · {tx.category}</span></div>
                      <div className={`tx-amount ${tx.direction === 'credit' ? 'credit' : ''}`}>{tx.direction === 'credit' ? '+' : '−'}{formatKes(tx.amount_cents)}</div>
                    </div>
                  ))}
                </div>
              ) : <p className="small muted">No transactions yet.</p>}
            </div>
            <div className="row wrap">
              {userDetail.user.status !== 'active' && (
                <button type="button" className="btn btn-soft btn-sm" onClick={() => runUserAction(userDetail.user.id, 'activate')}>Activate account</button>
              )}
              {userDetail.user.status !== 'suspended' && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => runUserAction(userDetail.user.id, 'suspend')}>Suspend</button>
              )}
              <button type="button" className="btn btn-danger btn-sm" onClick={() => { setDeleteError(''); setDeleteTarget(userDetail.user); }}>
                <Icon name="trash" size={13} /> Delete account
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={deleteBusy ? undefined : () => setDeleteTarget(null)}
        title="Delete this account?"
        description={deleteTarget ? `@${deleteTarget.username} and their wallet, transactions, submissions and enrollments will be removed. This cannot be undone.` : ''}
        size="sm"
        hideClose={deleteBusy}
      >
        {deleteError && <div className="mini-note warn" role="alert">{deleteError}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>Keep account</button>
          <button type="button" className="btn btn-danger" onClick={removeUser} disabled={deleteBusy}>
            {deleteBusy ? <><Spinner small label="Deleting account" /> Deleting…</> : 'Delete account'}
          </button>
        </div>
      </Modal>

      <Modal
        open={Boolean(trainingCancel)}
        onClose={trainingBusy ? undefined : () => setTrainingCancel(null)}
        title="Cancel training enrollment"
        description={trainingCancel ? `@${trainingCancel.username} will lose access to ${trainingCancel.course_title}.` : ''}
        size="sm"
        hideClose={trainingBusy}
      >
        <form className="stack" onSubmit={cancelEnrollment}>
          <Field label="Reason for cancellation" hint="The member receives this reason in a notification.">
            <textarea className="textarea" maxLength={300} value={trainingReason} onChange={(event) => setTrainingReason(event.target.value)} required />
          </Field>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setTrainingCancel(null)} disabled={trainingBusy}>Back</button>
            <button type="submit" className="btn btn-danger" disabled={trainingBusy}>
              {trainingBusy ? <><Spinner small label="Cancelling enrollment" /> Cancelling…</> : 'Cancel enrollment'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(trainingDelete)}
        onClose={trainingBusy ? undefined : () => setTrainingDelete(null)}
        title="Delete enrollment record?"
        description={trainingDelete ? `The record for @${trainingDelete.username} in ${trainingDelete.course_title} will be removed. The course payment record stays in the finance history.` : ''}
        size="sm"
        hideClose={trainingBusy}
      >
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setTrainingDelete(null)} disabled={trainingBusy}>Keep record</button>
          <button type="button" className="btn btn-danger" onClick={deleteEnrollment} disabled={trainingBusy}>
            {trainingBusy ? <><Spinner small label="Deleting record" /> Deleting…</> : 'Delete record'}
          </button>
        </div>
      </Modal>

      <Modal
        open={Boolean(supportReply)}
        onClose={replyBusy ? undefined : () => setSupportReply(null)}
        title="Reply to support request"
        description={supportReply ? `@${supportReply.username} · ${supportReply.category}` : ''}
        size="sm"
        hideClose={replyBusy}
      >
        <form className="stack" onSubmit={sendReply}>
          {replyError && <div className="mini-note warn" role="alert">{replyError}</div>}
          <div className="mini-note">{supportReply?.message}</div>
          <Field label="Reply" hint="Sent as a notification and email to the member.">
            <textarea className="textarea" maxLength={2000} value={replyText} onChange={(event) => setReplyText(event.target.value)} required />
          </Field>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setSupportReply(null)} disabled={replyBusy}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={replyBusy}>
              {replyBusy ? <><Spinner small label="Sending reply" /> Sending…</> : 'Send reply'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(ticketDelete)}
        onClose={busy ? undefined : () => setTicketDelete(null)}
        title="Delete support request?"
        description={ticketDelete ? `Request #${ticketDelete.id} from @${ticketDelete.username} will be removed.` : ''}
        size="sm"
      >
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setTicketDelete(null)} disabled={Boolean(busy)}>Keep request</button>
          <button type="button" className="btn btn-danger" onClick={removeTicket} disabled={Boolean(busy)}>
            {busy ? <><Spinner small label="Deleting request" /> Deleting…</> : 'Delete request'}
          </button>
        </div>
      </Modal>

      <ChangePassword open={passwordOpen} onClose={() => setPasswordOpen(false)} admin />
    </div>
  );
}
