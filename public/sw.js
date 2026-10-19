/*
 * The PWA keeps the last successfully loaded application shell locally. It
 * intentionally does not cache Supabase traffic: PowerSync already owns
 * offline data and its upload queue, while caching API responses here could
 * make a later authenticated session see somebody else's stale data.
 */
// `scripts/stamp-web-build.mjs` replaces this marker in dist/sw.js after
// every production export. That makes each real app release a worker update
// without requiring a hand-edited cache version.
const BUILD_ID = '__COMPOS_BUILD_ID__';
const CACHE_NAME = `compos-app-shell-${BUILD_ID}`;
// `scripts/stamp-web-build.mjs` replaces this entry with every runtime asset
// needed to boot the exported app. Without this, the first online visit
// installs the worker only after the JS/PowerSync workers were requested,
// so the next offline launch has HTML but no executable application.
const PRECACHE_ASSETS = ['__COMPOS_PRECACHE_ASSETS__'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// A new worker deliberately waits here. The visible "Yeni sürüm hazır"
// control is the user's explicit choice to activate it, avoiding a surprise
// reload in the middle of an entry flow.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // While an update is waiting, the currently controlling worker must keep
  // serving its own shell. Otherwise a page restart can pick up a newer
  // index/JS bundle from the network before the user has accepted the
  // visible update card.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
      ).catch(async () => (await caches.match(request)) || caches.match('/'))
    );
    return;
  }

  // Cache-first is deliberate: it keeps the active release coherent until
  // the user confirms the update. The new worker has a distinct cache name,
  // so after SKIP_WAITING it fetches the new hashed JS/font assets normally.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        return response;
      });
    })
  );
});
