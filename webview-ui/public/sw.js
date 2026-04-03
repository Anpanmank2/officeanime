// ── Service Worker — Office Anime PWA ──────────────────────────
const CACHE_NAME = 'office-anime-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip WebSocket and non-GET requests
  if (url.protocol === 'ws:' || url.protocol === 'wss:' || event.request.method !== 'GET') {
    return;
  }

  // Cache-first for static assets (js, css, png, fonts)
  if (url.pathname.match(/\.(js|css|png|jpg|woff2|svg|json)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for HTML and other resources
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
