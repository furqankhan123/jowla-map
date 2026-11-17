/* Jowla Map service worker. Bump CACHE_VERSION to invalidate caches. */
const CACHE_VERSION = 'v0.14.0';
const SHELL_CACHE = 'jowla-shell-' + CACHE_VERSION;
const DATA_CACHE = 'jowla-data-' + CACHE_VERSION;
const SHELL = [
  'index.html', 'newindex.html', 'map.css', 'map.js', 'nav.js', 'segments.js', 'config.js', 'optimize-route.js', 'cluster.js', 'writeback.js',
  'manifest.webmanifest', 'vendor/jquery-3.1.1.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL_CACHE, DATA_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // never touch Routes API POSTs
  const url = new URL(req.url);

  // Sheets data: network first, fall back to last good response
  if (url.hostname === 'sheets.googleapis.com') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(DATA_CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // App shell (same origin): stale-while-revalidate, ignoring ?v= so offline loads still match
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(SHELL_CACHE).then((cache) =>
        cache.match(req, { ignoreSearch: true }).then((hit) => {
          const net = fetch(req)
            .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
            .catch(() => hit);
          return hit || net;
        })
      )
    );
  }
  // Everything else (Maps JS, tiles, jQuery CDN) goes straight to the network.
});
