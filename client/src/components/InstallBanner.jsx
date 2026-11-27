import { useEffect, useState, useRef } from 'react';
import { useInstallPrompt } from '../hooks.js';
import { Icon } from './ui.jsx';

export function InstallBanner() {
  const { showInstallBanner, isInstalling, install, dismiss } = useInstallPrompt();
  const [visible, setVisible] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (showInstallBanner) {
      // Small delay to ensure smooth UX
      timer.current = setTimeout(() => setVisible(true), 500);
    } else {
      setVisible(false);
    }
    return () => clearTimeout(timer.current);
  }, [showInstallBanner]);

  if (!visible || !showInstallBanner) return null;

  return (
    <div className="install-banner" role="alert" aria-live="polite">
      <div className="install-content">
        <Icon name="download" size={20} />
        <div className="install-text">
          <strong>Install KaziLink app</strong>
          <span className="tiny muted">Add to your home screen for quick access</span>
        </div>
      </div>
      <div className="install-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>
          Later
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={install}
          disabled={isInstalling}
        >
          {isInstalling ? 'Installing…' : 'Install'}
        </button>
      </div>
    </div>
  );
}

export function InstallHint() {
  const { showInstallBanner, install, dismiss } = useInstallPrompt();
  const [visible, setVisible] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!showInstallBanner) {
      // Show hint after 30 seconds if not installed
      timer.current = setTimeout(() => setVisible(true), 30000);
    } else {
      setVisible(false);
    }
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
            install();
            setVisible(false);
          }}
        >
          Install now
        </button>
      </span>
    </div>
  );
}
