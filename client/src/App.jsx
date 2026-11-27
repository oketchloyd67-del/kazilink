import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context.jsx';
import Shell from './components/Shell.jsx';
import { BootSkeleton, OfflineBanner, PageSkeleton } from './components/ui.jsx';
import { CookieConsent, WhatsAppButton } from './components/Global.jsx';
import ChatWidget from './components/ChatWidget.jsx';
import { LoginPage, SignupPage } from './pages/auth.jsx';

const Landing = lazy(() => import('./pages/Landing.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Earn = lazy(() => import('./pages/Earn.jsx'));
const Wallet = lazy(() => import('./pages/Wallet.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Activate = lazy(() => import('./pages/Activate.jsx'));
const Videos = lazy(() => import('./pages/Videos.jsx'));
const Status = lazy(() => import('./pages/Status.jsx'));
const Affiliate = lazy(() => import('./pages/Affiliate.jsx'));
const Sudoku = lazy(() => import('./pages/Sudoku.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const Training = lazy(() => import('./pages/Training.jsx'));
const TrainingRoom = lazy(() => import('./pages/TrainingRoom.jsx'));
const Leaderboard = lazy(() => import('./pages/Leaderboard.jsx'));
const Legal = lazy(() => import('./pages/Legal.jsx'));

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <BootSkeleton />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function ScrollAndAnnounce() {
  const { pathname } = useLocation();
  const [message, setMessage] = useState('');

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const timer = window.setTimeout(() => setMessage(document.title), 220);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return <div className="sr-only" aria-live="polite" aria-atomic="true">{message}</div>;
}

function NotFound() {
  return (
    <main id="main" className="loading-screen" style={{ padding: 24 }}>
      <div className="card center" style={{ maxWidth: 430, width: '100%' }}>
        <div className="empty-icon" style={{ margin: '0 auto 12px', width: 48, height: 48, borderRadius: 14, background: 'var(--brand-soft)', color: 'var(--brand)', display: 'grid', placeItems: 'center' }}>
          <span aria-hidden="true" style={{ fontSize: 20, fontWeight: 800 }}>?</span>
        </div>
        <h1 className="page-title">Page not found</h1>
        <p className="muted mt-1">That link may be old or mistyped.</p>
        <Link to="/app" className="btn btn-primary mt-3">Back to dashboard</Link>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <OfflineBanner />
      <ScrollAndAnnounce />
      <WhatsAppButton />
      <CookieConsent />
      <Suspense fallback={<div style={{ padding: 24 }}><PageSkeleton label="Loading" /></div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/terms" element={<Legal kind="terms" />} />
          <Route path="/privacy" element={<Legal kind="privacy" />} />
          <Route path="/app" element={<RequireAuth><Shell /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="earn" element={<Earn />} />
            <Route path="wallet" element={<Wallet />} />
            <Route path="profile" element={<Profile />} />
            <Route path="activate" element={<Activate />} />
            <Route path="videos" element={<Videos />} />
            <Route path="status" element={<Status />} />
            <Route path="affiliate" element={<Affiliate />} />
            <Route path="sudoku" element={<Sudoku />} />
            <Route path="training" element={<Training />} />
            <Route path="training/room/:slug" element={<TrainingRoom />} />
            <Route path="leaderboard" element={<Leaderboard />} />
          </Route>
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <ChatWidget />
    </>
  );
}
