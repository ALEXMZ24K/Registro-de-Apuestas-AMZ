// v4 — siempre pide la versión más nueva de la página (sin caché) + notificaciones push
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

// Notificaciones push (enviadas por el Worker de Cloudflare)
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'AlexPicks';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: 'icon2-192.png',
    badge: 'icon2-badge-96.png',
    tag: d.tag || undefined,
    data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
    return clients.openWindow(url);
  }));
});
