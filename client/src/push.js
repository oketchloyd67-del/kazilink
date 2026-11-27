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

export async function enablePush() {
  if (!pushSupported()) {
    throw new Error('This browser does not support phone notifications. Use Chrome, Edge or an installed Android app.');
  }
  if (Notification.permission === 'denied') {
    throw new Error('Notifications are blocked. Allow them in your browser or phone settings, then try again.');
  }
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { publicKey } = await api('/push/public-key');
  if (!publicKey) throw new Error('Notifications are not configured on this server yet.');

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
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
