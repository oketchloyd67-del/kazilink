import { useEffect, useState, useRef } from 'react';
import { useInstallPrompt } from '../hooks.js';
import { isIos, isStandalone } from '../push.js';
import { Icon } from './ui.jsx';

const DISMISS_KEY = 'kazilink:install-dismissed';

function wasDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

function rememberDismissed() {
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
}

export function InstallBanner() {
  const { showInstallBanner, isInstalling, install, dismiss } = useInstallPrompt();
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (wasDismissed() || isStandalone()) return undefined;
    if (showInstallBanner) {
      timer.current = setTimeout(() => setVisible(true), 500);
    } else if (isIos()) {
      // iOS never fires beforeinstallprompt, so offer the manual route.
      timer.current = setTimeout(() => setVisible(true), 4000);
    } else {
      setVisible(false);
    }
    return () => clearTimeout(timer.current);
  }, [showInstallBanner]);

  if (!visible || isStandalone()) return null;
  if (!showInstallBanner && !isIos()) return null;

  const close = () => {
    rememberDismissed();
    setVisible(false);
    dismiss();
  };

  return (
    <div className="install-banner" role="region" aria-label="Install KaziLink">
      <div className="icon-wrap"><Icon name="download" size={19} /></div>
      <div className="install-text">
        <strong>Install KaziLink app</strong>
        {iosHint ? (
          <span className="tiny muted">
            Tap the Share button, then choose “Add to Home Screen”.
          </span>
        ) : (
          <span className="tiny muted">Add to your home screen for quick access and notifications</span>
        )}
      </div>
      <div className="install-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={close}>Later</button>
        {showInstallBanner ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={install} disabled={isInstalling}>
            {isInstalling ? 'Installing…' : 'Install'}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setIosHint(true)}>
            How to install
          </button>
        )}
      </div>
    </div>
  );
}

export function InstallHint() {
  const { showInstallBanner, install } = useInstallPrompt();
  const [visible, setVisible] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (showInstallBanner || isStandalone() || wasDismissed()) return undefined;
    timer.current = setTimeout(() => setVisible(true), 30000);
    return () => clearTimeout(timer.current);
  }, [showInstallBanner]);

  if (!visible) return null;

  return (
    <div className="install-hint">
      <Icon name="smartphone" size={14} />
      <span>
        Install for faster access
        <button
          type="button"
          className="install-hint-btn"
          onClick={() => {
            if (showInstallBanner) install();
            setVisible(false);
          }}
        >
          Install now
        </button>
      </span>
    </div>
  );
}
