/* Jowla Map service worker. Bump CACHE_VERSION to invalidate caches. */
const CACHE_VERSION = 'v0.24.7';
const SHELL_CACHE = 'jowla-shell-' + CACHE_VERSION;
const DATA_CACHE = 'jowla-data'; // unversioned: offline data survives deploys
const SHELL = [
  'index.html', 'newindex.html', 'map.css', 'map.js', 'nav.js', 'tour.js', 'segments.js', 'config.js', 'logic.js', 'optimize-route.js', 'cluster.js', 'writeback.js',
  'manifest.webmanifest', 'vendor/markerclusterer-2.5.3.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
  // No automatic skipWaiting: the page offers a Reload toast, then posts SKIP_WAITING.
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
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
          if (res.ok) {
            // Buffer the body first: streaming a clone of this ~18 MB response into Cache.put failed silently.
            const type = res.headers.get('content-type') || 'application/json';
            e.waitUntil(res.clone().arrayBuffer()
              .then((buf) => caches.open(DATA_CACHE).then((c) => c.put(req, new Response(buf, { headers: { 'content-type': type } }))))
              .catch(() => {}));
          }
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
  // Everything else (Maps JS, tiles) goes straight to the network.
});
