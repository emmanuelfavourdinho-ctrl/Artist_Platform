/* Fine Arts caches only this public offline shell and its public app icon.
 * It never stores navigations, API responses, or authenticated content. */
const CACHE_PREFIX = 'fine-arts-public-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const APPROVED_ASSETS = ['/offline.html', '/icons/fine-arts-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APPROVED_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network only for HTML. A failed navigation receives a generic public page;
  // no authenticated HTML or API response is written to Cache Storage.
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match('/offline.html')) || Response.error();
  }));
});
