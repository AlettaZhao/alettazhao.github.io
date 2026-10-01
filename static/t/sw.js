// Keeps the scan page usable with no signal: serve the last copy of the page,
// scripts, fonts and photos instantly, and refresh them in the background.
// Card data itself is cached by tapcard.js (localStorage), not here.
const CACHE = 'tapcard-v2';
const CORE = ['./', './qr.html', './tapcard.js', './tapcard.css', './config.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function cacheable(url) {
  if (url.origin === self.location.origin) return url.pathname.startsWith(new URL('./', self.location).pathname);
  return url.host === 'cdnjs.cloudflare.com' || url.host === 'fonts.googleapis.com' ||
    url.host === 'fonts.gstatic.com' || url.pathname.includes('/storage/v1/object/public/');
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!cacheable(url)) return;
  // Query strings (?u=…) all share one cached page shell.
  const key = url.origin === self.location.origin ? url.origin + url.pathname : req;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(key);
    const fresh = fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') cache.put(key, res.clone());
      return res;
    }).catch(() => hit || Response.error());
    if (hit) { e.waitUntil(fresh); return hit; }
    return fresh;
  }));
});
