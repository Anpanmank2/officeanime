// ── Service Worker — Office Anime PWA ──────────────────────────
// v5: Network-first for all assets. Cache only as offline fallback.
const CACHE_NAME = 'office-anime-v5';

self.addEventListener('install', (event) => {
  // Immediately take over from any previous SW
  self.skipWaiting();
  // Wipe ALL old caches on install
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('activate', (event) => {
  // Claim all clients immediately
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip WebSocket and non-GET
  if (url.protocol === 'ws:' || url.protocol === 'wss:' || event.request.method !== 'GET') {
    return;
  }

  // Network-first for everything: fetch from server, cache as fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
