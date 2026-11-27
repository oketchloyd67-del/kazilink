import { api } from './api.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

// True when the app is running as an installed PWA (home screen / desktop app).
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone === true
    || window.matchMedia?.('(display-mode: minimal-ui)')?.matches;
}

export function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

export async function enablePush() {
  if (!pushSupported()) {
    throw new Error(
      isIos() && !isStandalone()
        ? 'On iPhone and iPad, add KaziLink to your Home Screen first, then open it from there to enable notifications.'
        : 'This browser does not support phone notifications. Use Chrome, Edge or the installed app.',
    );
  }
  if (Notification.permission === 'denied') {
    throw new Error('Notifications are blocked. Allow them in your browser or phone settings, then try again.');
  }

  // Register the service worker before asking for permission so the
  // subscription is created against an active worker.
  const registration = await getRegistration();
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const { publicKey } = await api('/push/public-key');
  if (!publicKey) throw new Error('Notifications are not configured on this server yet.');

  const subscribe = () => registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await subscribe();
  } else {
    // A subscription created with an older VAPID key cannot be delivered to.
    // Re-create it so notifications render instead of silently failing.
    try {
      await api('/push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON() } });
    } catch {
      await subscription.unsubscribe().catch(() => {});
      subscription = await subscribe();
    }
  }
  await api('/push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON() } });
  return subscription;
}

export async function disablePush() {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await api('/push/unsubscribe', { method: 'POST', body: { endpoint: subscription.endpoint } }).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  }
}

export function notificationState() {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}
