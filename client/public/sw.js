const CACHE = 'kazilink-shell-v4';
const OFFLINE_URL = '/offline.html';
const CORE = [
  '/',
  '/app',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/img/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon-32.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE.map((url) => new Request(url, { cache: 'reload' }))))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const timeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout')), ms);
  promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
});

async function offlineFallback() {
  return (await caches.match('/app')) || (await caches.match('/')) || (await caches.match(OFFLINE_URL)) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Pages: network first, but never keep the user waiting too long on 2G.
  if (request.mode === 'navigate') {
    event.respondWith(
      timeout(fetch(request), 6000)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/app', copy)).catch(() => {});
          }
          return response;
        })
        .catch(offlineFallback),
    );
    return;
  }

  // Static assets: cache first, then network, and fill the cache for next time.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && /\.(?:js|css|svg|png|webp|ico|woff2?|webmanifest)$/.test(url.pathname)) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      }).catch(() => cached || Response.error());
    }),
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'KaziLink', body: 'You have a new update.', url: '/app' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'KaziLink', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      tag: data.tag || 'kazilink-update',
      data: { url: data.url || '/app' },
      vibrate: [80, 40, 80],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        existing.navigate(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
