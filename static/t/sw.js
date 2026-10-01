// Keeps the scan page usable with no signal.
// - This site's own files: try the network first (so updates arrive whole, never
//   half old and half new); fall back to the saved copy after 3 s or when offline.
// - Libraries, fonts and uploaded photos never change at a given URL, so the saved
//   copy is used straight away.
// Card data itself is cached by tapcard.js (localStorage), not here.
const CACHE = 'tapcard-v3';
const CORE = ['./', './qr.html', './config.js?v=4', './tapcard.js?v=4', './tapcard.css?v=4', './qr.js?v=4', './qr.css?v=4',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'];

// The site's own files are stored without their ?v= so one saved copy serves every version link.
const keyFor = u => { const url = new URL(u, self.location); return url.origin === self.location.origin ? url.origin + url.pathname : url.href; };

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(CORE.map(u => fetch(u).then(res => res.ok && c.put(keyFor(u), res)).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('tapcard-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const SCOPE = new URL('./', self.location).pathname;
const ownFile = url => url.origin === self.location.origin && url.pathname.startsWith(SCOPE);
const fixedFile = url => url.host === 'cdnjs.cloudflare.com' || url.host === 'fonts.googleapis.com' ||
  url.host === 'fonts.gstatic.com' || url.pathname.includes('/storage/v1/object/public/');

function save(cache, key, res) {
  if (res && (res.ok || res.type === 'opaque')) cache.put(key, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (ownFile(url)) {
    // Query strings (?alex) all share one saved page.
    const key = url.origin + url.pathname;
    e.respondWith(caches.open(CACHE).then(async cache => {
      const net = fetch(req).then(res => save(cache, key, res));
      net.catch(() => {});
      const slow = new Promise(r => setTimeout(r, 3000)).then(() => cache.match(key)).then(hit => hit || net);
      try {
        return (await Promise.race([net, slow])) || Response.error();
      } catch (err) {
        return (await cache.match(key)) || Response.error();
      }
    }));
  } else if (fixedFile(url)) {
    e.respondWith(caches.open(CACHE).then(async cache =>
      (await cache.match(req)) || fetch(req).then(res => save(cache, req, res))));
  }
});
