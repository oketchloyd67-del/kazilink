import { useState, useEffect, useRef } from 'react';

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const handler = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if already installed
    const uninstallHandler = (event) => {
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', unloadHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', unloadHandler);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;

    setIsInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowInstallBanner(false);
      }
    } catch (err) {
      console.error('Install failed:', err);
    } finally {
      setIsInstalling(false);
      setDeferredPrompt(null);
    }
  };

  const dismiss = () => {
    setShowInstallBanner(false);
    setDeferredPrompt(null);
  };

  return { showInstallBanner, isInstalling, install, dismiss };
}
