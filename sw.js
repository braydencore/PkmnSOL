// Network-first service worker: always serve the latest deploy when
// online, and only fall back to a cached copy when the network fails
// (so the installed PWA still runs offline). A cache-first strategy here
// would keep serving whatever was cached on the very first visit forever,
// fighting every future deploy.
const CACHE = 'pkmnsol-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok) caches.open(CACHE).then((cache) => cache.put(e.request, res.clone()));
        return res;
      })
      .catch(async () => (await caches.match(e.request)) || Response.error())
  );
});
