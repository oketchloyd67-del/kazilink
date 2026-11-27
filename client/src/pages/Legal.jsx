import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context.jsx';
import { useDocumentTitle } from '../hooks.js';
import { Icon } from '../components/ui.jsx';
import { LegalLinks } from '../components/Global.jsx';

const UPDATED = '26 November 2026';

const TERMS = [
  {
    title: '1. Using KaziLink',
    body: 'KaziLink is a rewards and skills platform. You must be at least 18 years old and provide accurate registration details. One person may hold one account. Accounts, balances and training access may not be sold or transferred.',
  },
  {
    title: '2. Activation and fees',
    body: 'New accounts start inactive and must complete the one-time activation payment of KSh 100 before earning features and the Academy are unlocked. Course fees are KSh 1,200 for Cyber Security Fundamentals, KSh 1,800 for Web Development and KSh 2,500 for Penetration Testing, each covering a three-month term. Fees are shown before every payment.',
  },
  {
    title: '3. Earning, verification and payouts',
    body: 'Rewards are credited only after the stated verification, including admin review of screenshots. Fake, duplicated or manipulated evidence is rejected and may lead to suspension. Withdrawals are reserved from your balance when requested and are paid after admin approval. Rejected or cancelled requests are returned to your balance. Daily and bucket limits apply and are shown in the wallet.',
  },
  {
    title: '4. Training academy',
    body: 'Enrollment gives you access to the training room for the paid term and to the scheduled live sessions. Sessions run on the published days and times. Renewal is required to continue after the term ends. Recordings and materials are for enrolled students only. Ethical hacking skills must only be used on systems you own or are explicitly authorised to test.',
  },
  {
    title: '5. Leaderboard and vouchers',
    body: 'The monthly leaderboard ranks members by approved withdrawals. The top withdrawer of a completed month may claim a KSh 1,000 coupon voucher after paying the KSh 100 voucher activation fee from their wallet. A voucher is a coupon, not cash, is valid for 90 days and may be subject to availability of the products or services it covers.',
  },
  {
    title: '6. Account suspension and deletion',
    body: 'We may suspend or remove accounts involved in fraud, abuse, duplicate accounts or attempts to compromise the platform. Inactive accounts may receive a 24-hour activation notice before deletion. You may request deletion through the support form; deletion removes your account data subject to records we must retain for legal and financial purposes.',
  },
  {
    title: '7. Prohibited conduct',
    body: 'Do not attempt to access other members’ accounts, interfere with the service, submit false evidence, automate earning features, or use the platform for unlawful activity. Security testing of KaziLink itself is not permitted.',
  },
  {
    title: '8. Changes and liability',
    body: 'Features, fees and reward rules may change with notice in the app or the WhatsApp channel. KaziLink is not liable for losses caused by sharing your password, OTP or M-Pesa PIN, by using the wrong crypto address or network, or by network failures outside our control.',
  },
];

const PRIVACY = [
  {
    title: 'What we collect',
    body: 'We collect your name, email, username, phone number, hashed password, device and session information, payment references, task evidence you upload, support requests and activity needed to calculate rewards. We do not collect or store your M-Pesa PIN.',
  },
  {
    title: 'Why we use it',
    body: 'To create and secure your account, verify payments, calculate and pay rewards, deliver training access, review submissions, prevent fraud, send service notifications and answer support requests. We do not sell your personal data.',
  },
  {
    title: 'Cookies and device storage',
    body: 'KaziLink uses an essential session cookie to keep you signed in securely. We also store preferences such as theme, text size and cookie acceptance on your device. Notification subscriptions are stored only when you enable phone notifications. You can clear these in your browser settings.',
  },
  {
    title: 'Who can see your data',
    body: 'Authorised administrators can see account, payment, withdrawal and submission details to review requests. Payment processing is handled by our M-Pesa payment partner and email delivery by our mail provider. We share only the data required for those services.',
  },
  {
    title: 'How long we keep it',
    body: 'Account and transaction records are kept while your account is open and for as long as required for financial, fraud-prevention and legal records. Support requests are kept until resolved and for a reasonable follow-up period. Uploaded evidence is kept while a submission is being reviewed and for dispute handling.',
  },
  {
    title: 'Your choices',
    body: 'You can update your password, enable two-factor authentication, sign out all devices, turn off notifications and request account deletion through support. You may request a copy or correction of your account details through the support form.',
  },
  {
    title: 'Security',
    body: 'We use hashed passwords, secure session cookies, rate limiting, origin checks, two-factor authentication options and admin review for payouts. No system is perfectly secure: protect your password, OTP and PIN, and report suspicious activity immediately using the support form.',
  },
];

export default function Legal({ kind = 'terms' }) {
  const { user } = useAuth();
  const location = useLocation();
  useDocumentTitle(kind === 'privacy' ? 'Privacy policy' : 'Terms and conditions');
  const sections = kind === 'privacy' ? PRIVACY : TERMS;

  useEffect(() => {
    if (location.hash) {
      const element = document.getElementById(location.hash.slice(1));
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [location.hash, kind]);

  return (
    <div className="legal-shell">
      <header className="legal-head">
        <Link to="/" className="brand-lockup">
          <img src="/img/logo.png" alt="" />
          KaziLink
        </Link>
        <nav className="row" aria-label="Legal pages">
          <Link to="/terms" className={`btn btn-sm ${kind === 'terms' ? 'btn-soft' : 'btn-ghost'}`}>Terms</Link>
          <Link to="/privacy" className={`btn btn-sm ${kind === 'privacy' ? 'btn-soft' : 'btn-ghost'}`}>Privacy</Link>
          {user ? <Link to="/app" className="btn btn-primary btn-sm">Back to app</Link> : <Link to="/login" className="btn btn-primary btn-sm">Log in</Link>}
        </nav>
      </header>

      <main id="main" className="legal-main">
        <span className="eyebrow">Legal</span>
        <h1 className="display" style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', marginTop: 8 }}>
          {kind === 'privacy' ? 'Privacy policy' : 'Terms and conditions'}
        </h1>
        <p className="muted mt-2">Last updated {UPDATED}. These documents apply to every KaziLink account.</p>

        <div className="legal-note">
          <Icon name="shield" size={18} />
          <p>
            KaziLink never asks for your M-Pesa PIN, your password or a one-time code by email, WhatsApp or chat.
            All support requests are handled through the verified in-app support form.
          </p>
        </div>

        <div className="legal-grid">
          <nav className="legal-toc" aria-label={kind === 'privacy' ? 'Privacy sections' : 'Terms sections'}>
            {sections.map((section, index) => (
              <a key={section.title} href={`#section-${index + 1}`}>{section.title}</a>
            ))}
            {kind === 'privacy' && <a href="#cookies">Cookies and storage</a>}
          </nav>
          <article className="legal-body">
            {sections.map((section, index) => (
              <section key={section.title} id={`section-${index + 1}`}>
                <h2>{section.title}</h2>
                <p>{section.body}</p>
              </section>
            ))}
            {kind === 'privacy' && (
              <section id="cookies">
                <h2>Cookies and acceptance</h2>
                <p>
                  The cookie notice is shown until you accept it. Accepting stores your choice on this device only.
                  Essential cookies cannot be switched off because sign-in, security checks and payments depend on them.
                  You can clear cookie acceptance and other local preferences from Account → Privacy and cookies.
                </p>
              </section>
            )}
            <div className="mini-note mt-4">
              Questions about these documents can be sent through the in-app support form. A signed-in member can open it from the assistant button on any page.
            </div>
            <LegalLinks className="mt-4" />
          </article>
        </div>
      </main>
    </div>
  );
}
