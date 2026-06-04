/* Service Worker — network-first for HTML, cache-first for assets.
   Once registered on a browser, ensures every visit gets fresh HTML
   from the network. Falls back to cache only when offline. */

const CACHE_NAME = 'mgfj-v4';

self.addEventListener('install', event => {
  /* Take over immediately — don't wait for next reload */
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    /* Clear ALL old caches */
    const names = await caches.keys();
    await Promise.all(names.map(n => caches.delete(n)));
    /* Take control of all open pages instantly */
    await self.clients.claim();
    /* Tell all open pages to reload so they get fresh HTML */
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => client.navigate(client.url));
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  /* Only handle same-origin GET requests */
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;

  /* HTML pages: always network. If offline, try cache. */
  const isHTML = event.request.mode === 'navigate' ||
                 event.request.headers.get('accept')?.includes('text/html');
  if (isHTML) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(resp => {
          /* Cache a copy as offline fallback */
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  /* JS & CSS: network-first so code changes always arrive immediately.
     Falls back to cache only when offline. */
  const isCode = /\.(js|css)(\?|$)/i.test(url.pathname + url.search) ||
                 /\.(js|css)$/i.test(url.pathname);
  if (isCode) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  /* Images & other assets: stale-while-revalidate (fast + self-updating). */
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(resp => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
