import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './ui.jsx';

const CONSENT_KEY = 'kazilink:cookie-consent';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(!localStorage.getItem(CONSENT_KEY));
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const accept = () => {
    try { localStorage.setItem(CONSENT_KEY, new Date().toISOString()); } catch {}
    setVisible(false);
  };

  return (
    <div className="cookie-banner" role="region" aria-label="Cookie notice">
      <div className="cookie-icon"><Icon name="shield" size={18} /></div>
      <div className="grow">
        <strong>Your privacy matters</strong>
        <p>
          We use essential cookies for secure sign-in and store preferences on your device.
          Read the <Link to="/privacy">Privacy Policy</Link> and <Link to="/terms">Terms</Link>.
        </p>
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={accept}>Accept cookies</button>
    </div>
  );
}

export function WhatsAppButton() {
  const [url, setUrl] = useState('https://whatsapp.com/channel/');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.whatsappChannelUrl) setUrl(data.whatsappChannelUrl);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <a
      className="whatsapp-float"
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Open the official KaziLink WhatsApp channel"
      title="KaziLink WhatsApp channel"
    >
      <Icon name="whatsapp" size={24} />
      <span className="wa-label">WhatsApp channel</span>
    </a>
  );
}

export function LegalLinks({ className = '' }) {
  return (
    <nav className={`legal-links ${className}`} aria-label="Legal">
      <Link to="/terms">Terms and conditions</Link>
      <Link to="/privacy">Privacy policy</Link>
      <Link to="/privacy#cookies">Cookies</Link>
    </nav>
  );
}
