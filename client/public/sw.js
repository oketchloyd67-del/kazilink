const CACHE = 'kazilink-shell-v5';
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

function readPushData(event) {
  const fallback = { title: 'KaziLink', body: 'You have a new update.', url: '/app' };
  if (!event.data) return fallback;
  try {
    const parsed = event.data.json();
    if (parsed && typeof parsed === 'object') return { ...fallback, ...parsed };
  } catch {}
  try {
    return { ...fallback, body: event.data.text() };
  } catch {
    return fallback;
  }
}

function safeUrl(value) {
  try {
    const url = new URL(value || '/app', self.location.origin);
    if (url.origin === self.location.origin) return url.pathname + url.search + url.hash;
  } catch {}
  return '/app';
}

self.addEventListener('push', (event) => {
  const data = readPushData(event);
  const target = safeUrl(data.url);
  const title = String(data.title || 'KaziLink').slice(0, 120);
  const body = String(data.body || '').slice(0, 400);
  const options = {
    body,
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/favicon-32.png',
    tag: data.tag || 'kazilink-update',
    renotify: Boolean(data.tag),
    data: { url: target },
    dir: 'ltr',
    lang: 'en-KE',
    timestamp: Date.now(),
    vibrate: [80, 40, 80],
  };
  if (data.image) options.image = data.image;
  event.waitUntil(
    self.registration.showNotification(title, options).catch(() =>
      // Some browsers reject unknown options (for example renotify on iOS).
      self.registration.showNotification(title, {
        body,
        icon: options.icon,
        badge: options.badge,
        tag: options.tag,
        data: options.data,
      }),
    ),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = safeUrl(event.notification.data?.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const sameOrigin = clients.filter((client) => {
        try { return new URL(client.url).origin === self.location.origin; } catch { return false; }
      });
      const existing = sameOrigin[0];
      if (existing) {
        return existing.navigate(target).then(() => existing.focus()).catch(() => existing.focus());
      }
      return self.clients.openWindow(target);
    }).catch(() => self.clients.openWindow(target)),
  );
});
