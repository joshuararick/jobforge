// Offline shell: cache the app's own files, never cache job-board API calls
// (those must always be fresh). Bump CACHE when you change app files.
const CACHE = 'jobforge-v2';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.json', './icon-192.png', './icon-512.png',
  './js/app.js', './js/storage.js', './js/text.js', './js/sources.js', './js/matcher.js',
  './js/tracker.js', './js/resumes.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first for our own files (so updates show up), cache as the offline fallback.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
