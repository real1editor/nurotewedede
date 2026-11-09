// NuroTewedede Service Worker - simple app-shell cache for offline use.
// Bump CACHE below (and re-register) whenever app shell assets change to avoid stale caches.
const CACHE = 'nurotewedede-v6';
const ASSETS = [
  './',
  './index.html',
  './config.js',
  './tailwind.css',
  './style.css',
  './script.js',
  './manifest.json',
  './icon.svg',
  './logo.jpeg'
];

const API_CACHE = 'nurotewedede-api-v1';
const API_ASSETS = [
  '/api/pools',
  '/api/products'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k !== API_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (!isSameOrigin) {
    // Cross-origin API calls (the configured backend) must never be intercepted.
    return;
  }

  // Only cache the public, read-only listing endpoints. Never cache auth or
  // per-user routes (e.g. /api/products/mine, /api/auth/me) so a shared device
  // can't serve another session's data from the cache.
  const isCacheableApi = event.request.method === 'GET' &&
    (url.pathname === '/api/pools' || url.pathname === '/api/products');

  if (isCacheableApi) {
    event.respondWith(
      caches.open(API_CACHE).then((cache) => {
        return cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok && response.type === 'basic') {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // Never cache non-GET traffic (including every /api mutation).
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-first for the app shell: always prefer fresh files while online,
  // fall back to the cache only when offline. Prevents stale script/style/html
  // being served after deployments (the old cache-first strategy did exactly that).
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      })
  );
});
