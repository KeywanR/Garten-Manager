/* Mein Garten – offline service worker.
   Precaches the app shell so it runs with no connection. Bump CACHE on changes. */
const CACHE = 'mein-garten-v49';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './ki-diagnose.js',
  './cloud-sync.js',
  './manifest.webmanifest',
  './icon-32.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Only handle our own origin. Google sign-in / Drive API and other cross-origin
  // requests must go straight to the network — never cache auth'd or dynamic data.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Code (HTML/JS) is network-first, assets stay cache-first.
  //
  // This used to be cache-first for everything, which meant a device could serve
  // a months-old build indefinitely: the cached copy always won, and the worker
  // only re-checked on a real navigation — which an installed PWA frequently
  // skips when relaunched from the app switcher. Two devices then silently ran
  // different code while both looking fine, which is genuinely hard to diagnose
  // from the outside.
  //
  // Network-first costs one request when online and still falls back to the
  // cache the moment the network is unavailable, so offline use is unaffected.
  const isCode = req.mode === 'navigate' || /\.(html|js)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (isCode) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
