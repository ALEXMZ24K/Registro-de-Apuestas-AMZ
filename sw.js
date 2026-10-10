// v3 — siempre pide la versión más nueva de la página (sin caché)
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(() => clients.claim())
));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method === 'GET' && (r.mode === 'navigate' || (r.destination === 'document'))) {
    e.respondWith(fetch(r.url, { cache: 'no-store' }).catch(() => fetch(r)));
  }
});
