/**
 * Service Worker for Shiftly PWA
 * Network-First with Offline Cache Fallback: always serves latest files when online/local,
 * and falls back seamlessly to IndexedDB + Cache when offline.
 */

const CACHE_NAME = 'shiftly-cache-v4.6.4';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/app.js',
  './js/db.js',
  './js/time_engine.js',
  './js/export_service.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './assets/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        ASSETS_TO_CACHE.map(async (url) => {
          const resp = await fetch(new Request(url, { cache: 'reload' }));
          if (resp && resp.ok) {
            await cache.put(url, resp);
          }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  const fetchRequest = isSameOrigin
    ? new Request(event.request.url, { cache: 'no-cache', credentials: 'same-origin' })
    : event.request;

  event.respondWith(
    fetch(fetchRequest)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html', { ignoreSearch: true });
          }
        });
      })
  );
});
