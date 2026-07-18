/* Mein Garten – offline service worker.
   Precaches the app shell so it runs with no connection. Bump CACHE on changes. */
const CACHE = 'mein-garten-v20';
const ASSETS = [
  './',
  './index.html',
  './app.js',
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
  if (new URL(req.url).origin !== self.location.origin) return;
  // App shell: cache-first. Everything else: try cache, fall back to network, then index.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
