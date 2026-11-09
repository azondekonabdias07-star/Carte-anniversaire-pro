/* Service worker : l'app fonctionne hors ligne une fois chargée.
   - Fichiers de l'app : mis en cache à l'installation
   - CDN (Tailwind, html2canvas, polices) : mis en cache à la première utilisation */
const CACHE = 'cartes-v2';
const SHELL = ['./', './index.html', './app.js', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Cache d'abord, mise à jour en arrière-plan
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || !r.url.startsWith('http')) return;
  e.respondWith(caches.match(r).then(hit => {
    const net = fetch(r).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
