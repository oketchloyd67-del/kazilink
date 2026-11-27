import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context.jsx';
import { formatKes, initials, timeAgo } from '../lib.js';
import { enablePush, notificationState, pushSupported } from '../push.js';
import { Icon, Modal, Spinner, useToast } from './ui.jsx';
import { LegalLinks } from './Global.jsx';

export const FEATURES = [
  { key: 'videos', path: '/app/videos', label: 'Watch & earn', desc: 'Daily video plus creator tasks', icon: 'play', color: '#5b3df5', bg: '#f0edff' },
  { key: 'status', path: '/app/status', label: 'WhatsApp status', desc: 'Promote the product of the day', icon: 'share', color: '#0f9b6c', bg: '#e8f8f1' },
  { key: 'affiliate', path: '/app/affiliate', label: 'Affiliate marketing', desc: 'Earn 20% on every activation', icon: 'users', color: '#c07a10', bg: '#fff4e2' },
  { key: 'sudoku', path: '/app/sudoku', label: 'Sudoku challenge', desc: 'Triple your entry in 60 seconds', icon: 'grid', color: '#c14860', bg: '#fdeef1' },
];

export default function Shell() {
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lockedFeature, setLockedFeature] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [balanceCents, setBalanceCents] = useState(0);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const { push: toast } = useToast();

  const active = user?.status === 'active';

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    api('/wallet').then((data) => setBalanceCents(data.balanceCents)).catch(() => {});
  }, [user, location.pathname]);

  useEffect(() => {
    if (!user) return;
    api('/notifications').then((data) => {
      setNotifications(data.notifications);
      setUnread(data.unread);
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user || !pushSupported()) return;
    const dismissed = localStorage.getItem('kazilink:push-dismissed') === '1';
    api('/push/status')
      .then((data) => {
        if (!data.subscribedDevices && notificationState() === 'default' && !dismissed) setShowPushPrompt(true);
      })
      .catch(() => {});
  }, [user]);

  const turnOnNotifications = async () => {
    setPushBusy(true);
    try {
      await enablePush();
      setShowPushPrompt(false);
      toast('Phone notifications are enabled for this device.', 'success', 6000);
    } catch (error) {
      toast(error.message, 'error', 7000);
    } finally {
      setPushBusy(false);
    }
  };

  const dismissPush = () => {
    setShowPushPrompt(false);
    try { localStorage.setItem('kazilink:push-dismissed', '1'); } catch {}
  };

  const openNotifications = async () => {
    setNotifOpen(true);
    setLoadingNotifs(true);
    try {
      const data = await api('/notifications');
      setNotifications(data.notifications);
      if (data.unread) {
        await api('/notifications/read', { method: 'POST' });
        setUnread(0);
      }
    } catch {} finally {
      setLoadingNotifs(false);
    }
  };

  const onFeatureClick = (feature) => {
    setDrawerOpen(false);
    if (!active) {
      setLockedFeature(feature);
      return;
    }
    navigate(feature.path);
  };

  const goActivate = () => {
    setLockedFeature(null);
    navigate('/app/activate');
  };

  const navLink = (to, label, icon, end = false, badge) => (
    <NavLink to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      <Icon name={icon} size={17} />
      <span>{label}</span>
      {badge === 'inactive' && <span className="nav-badge">Inactive</span>}
      {badge === 'lock' && <Icon name="lock" size={13} className="nav-lock" />}
    </NavLink>
  );

  const drawerFeature = (feature) => (
    <button key={feature.key} className="nav-link" onClick={() => onFeatureClick(feature)} style={{ width: '100%', background: 'none', border: 'none' }}>
      <span style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', background: feature.bg, color: feature.color }}>
        <Icon name={feature.icon} size={14} />
      </span>
      <span>{feature.label}</span>
      {!active && <Icon name="lock" size={13} className="nav-lock" />}
    </button>
  );

  const shell = (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/app" className="sidebar-brand">
          <img src="/img/logo.png" alt="" />
          KaziLink
        </NavLink>
        <div className="nav-group">
          <span className="nav-label">Overview</span>
          {navLink('/app', 'Dashboard', 'home', true, user?.status === 'inactive' ? 'inactive' : undefined)}
          {navLink('/app/earn', 'Earn', 'earn')}
          {navLink('/app/wallet', 'Wallet', 'wallet')}
          {navLink('/app/profile', 'Account', 'user')}
        </div>
        <div className="nav-group">
          <span className="nav-label">Grow</span>
          {navLink('/app/training', 'Training Academy', 'book')}
          {navLink('/app/leaderboard', 'Leaderboard', 'trophy')}
        </div>
        <div className="nav-group">
          <span className="nav-label">Earning features</span>
          {FEATURES.map((feature) => (
            active ? navLink(feature.path, feature.label, feature.icon) : (
              <button key={feature.key} className="nav-link" style={{ border: 'none', background: 'none', width: '100%' }} onClick={() => setLockedFeature(feature)}>
                <Icon name={feature.icon} size={17} />
                <span>{feature.label}</span>
                <Icon name="lock" size={13} className="nav-lock" />
              </button>
            )
          ))}
        </div>
        <div className="sidebar-foot">
          <div className="sidebar-user">
            <div className="avatar">{initials(user?.firstName, user?.lastName)}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '.78rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.fullName}</div>
              <div style={{ fontSize: '.67rem', color: 'var(--muted)' }}>@{user?.username}</div>
            </div>
            <button className="btn-icon" style={{ width: 30, height: 30, border: 'none' }} onClick={() => logout()} aria-label="Log out">
              <Icon name="logout" size={15} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button className="btn-icon" style={{ display: 'none' }} />
          <button
            className="btn-icon"
            id="mobile-menu-btn"
            style={{ border: 'none' }}
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls="app-drawer"
          >
            <Icon name="menu" size={20} />
          </button>
          <NavLink to="/app" className="row" style={{ gap: 8, fontWeight: 800, letterSpacing: '-.03em' }}>
            <img src="/img/logo.png" alt="" style={{ width: 28, height: 28, borderRadius: 8 }} />
            <span className="mobile-only-brand">KaziLink</span>
          </NavLink>
          <span className="topbar-spacer" />
          <button className="balance-chip" onClick={() => navigate('/app/wallet')} aria-label={`Available balance ${formatKes(balanceCents)}. Open wallet.`}>
            <span className="dot" aria-hidden="true" />
            <span aria-hidden="true">{formatKes(balanceCents)}</span>
          </button>
          <button className="btn-icon" style={{ position: 'relative', border: 'none' }} onClick={openNotifications} aria-label="Notifications">
            <Icon name="bell" size={19} />
            {unread > 0 && (
              <span style={{ position: 'absolute', top: 6, right: 7, width: 7, height: 7, borderRadius: '50%', background: 'var(--red)' }} />
            )}
          </button>
          <button onClick={() => navigate('/app/profile')} aria-label="Account" style={{ border: 'none', background: 'none', padding: 0 }}>
            <div className="avatar sm">{initials(user?.firstName, user?.lastName)}</div>
          </button>
        </header>

        <main className="page" id="main" tabIndex={-1}>
          {showPushPrompt && (
            <div className="push-prompt" role="status">
              <div className="push-prompt-icon"><Icon name="bell" size={18} /></div>
              <div className="grow">
                <strong>Get task and payment updates on your phone</strong>
                <p>Allow notifications so new tasks, rewards and withdrawal updates reach you automatically.</p>
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={turnOnNotifications} disabled={pushBusy}>
                {pushBusy ? <><Spinner small label="Enabling notifications" /> Enabling…</> : 'Enable notifications'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={dismissPush} disabled={pushBusy}>Not now</button>
            </div>
          )}
          <Outlet context={{ promptActivation: (feature) => setLockedFeature(feature) }} />
          <footer className="app-foot">
            <span>© {new Date().getFullYear()} KaziLink</span>
            <LegalLinks />
          </footer>
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Primary">
        {[
          ['/app', 'home', 'Home', true],
          ['/app/earn', 'earn', 'Earn', false],
          ['/app/wallet', 'wallet', 'Wallet', false],
          ['/app/profile', 'user', 'Account', false],
        ].map(([to, icon, label, end]) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `bottom-link ${isActive ? 'active' : ''}`}>
            <span className="bottom-icon"><Icon name={icon} size={19} /></span>
            {label}
          </NavLink>
        ))}
      </nav>

      {drawerOpen && (
        <>
          <div className="menu-overlay" onClick={() => setDrawerOpen(false)} />
          <aside className="drawer" id="app-drawer" aria-label="Menu">
            <div className="drawer-head">
              <div className="row">
                <div className="avatar">{initials(user?.firstName, user?.lastName)}</div>
                <div>
                  <div style={{ fontSize: '.85rem', fontWeight: 750 }}>{user?.fullName}</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{user?.publicId}</div>
                </div>
              </div>
              <button className="btn-icon round" onClick={() => setDrawerOpen(false)} aria-label="Close menu"><Icon name="close" size={17} /></button>
            </div>
            <div className="card pad-sm" style={{ boxShadow: 'none', background: active ? 'var(--green-soft)' : 'var(--orange-soft)', border: 'none' }}>
              <div className="row-between">
                <span style={{ fontSize: '.78rem', fontWeight: 700, color: active ? '#0c7e53' : '#9a5b00' }}>
                  {active ? 'Account active' : 'Account inactive'}
                </span>
                {!active && <button className="btn btn-activate btn-sm" onClick={() => { setDrawerOpen(false); navigate('/app/activate'); }}>Activate</button>}
              </div>
            </div>
            <div className="drawer-links">
              <span className="nav-label">Overview</span>
              {navLink('/app', 'Dashboard', 'home', true)}
              {navLink('/app/earn', 'Earn', 'earn')}
              {navLink('/app/wallet', 'Wallet', 'wallet')}
              {navLink('/app/profile', 'Account', 'user')}
              <span className="nav-label">Grow</span>
              {navLink('/app/training', 'Training Academy', 'book')}
              {navLink('/app/leaderboard', 'Leaderboard', 'trophy')}
              <span className="nav-label">Earning features</span>
              {FEATURES.map(drawerFeature)}
              <span className="nav-label">More</span>
              <button className="nav-link" style={{ border: 'none', background: 'none', width: '100%' }} onClick={() => { setDrawerOpen(false); navigate('/app/activate'); }}>
                <Icon name="spark" size={17} /> Activation
              </button>
              <button className="nav-link" style={{ border: 'none', background: 'none', width: '100%' }} onClick={() => logout()}>
                <Icon name="logout" size={17} /> Log out
              </button>
            </div>
            <div style={{ marginTop: 'auto' }}>
              <p className="tiny muted">Sessions expire after 20 minutes of inactivity or when you log out.</p>
            </div>
          </aside>
        </>
      )}

      <Modal
        open={Boolean(lockedFeature)}
        onClose={() => setLockedFeature(null)}
        size="sm"
        title="Activate to unlock"
        description={lockedFeature ? `${lockedFeature.label} is available once your account is active. Activation is a one-time payment and unlocks every KaziLink feature.` : ''}
      >
        <div className="row" style={{ background: 'var(--orange-soft)', padding: 14, borderRadius: 13, gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(245,158,11,.2)', color: '#9a5b00', display: 'grid', placeItems: 'center', flex: 'none' }}>
            <Icon name="lock" size={19} />
          </div>
          <div>
            <strong style={{ fontSize: '.82rem', color: '#7d4a00' }}>Your account is inactive</strong>
            <p className="tiny" style={{ color: '#9a6a1f', marginTop: 2 }}>Activating takes less than a minute.</p>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setLockedFeature(null)}>Not now</button>
          <button className="btn btn-activate" onClick={goActivate}>Activate?</button>
        </div>
      </Modal>

      <Modal open={notifOpen} onClose={() => setNotifOpen(false)} title="Notifications" description="Rewards, approvals and account updates.">
        {loadingNotifs && !notifications.length ? (
          <div className="center" style={{ padding: 20 }}><Spinner /></div>
        ) : notifications.length ? (
          <div className="tx-list">
            {notifications.map((item) => (
              <div className="tx-row" key={item.id} style={{ alignItems: 'flex-start' }}>
                <div className="tx-icon" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}><Icon name="bell" size={15} /></div>
                <div className="tx-main">
                  <strong style={{ whiteSpace: 'normal' }}>{item.title}</strong>
                  <span style={{ display: 'block', marginTop: 2, lineHeight: 1.5 }}>{item.body}</span>
                </div>
                <span className="tiny muted" style={{ flex: 'none' }}>{timeAgo(item.created_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty" style={{ padding: 24 }}>
            <div className="empty-icon"><Icon name="bell" size={20} /></div>
            <p>No notifications yet. Your rewards and approvals will show up here.</p>
          </div>
        )}
      </Modal>
    </div>
  );

  return shell;
}
