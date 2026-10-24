// Telefona kurulabilmesi için + anlık bildirimler. Sayfalar her zaman ağdan yüklenir (güncellemeler hemen gelsin).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
self.addEventListener('push', e => {
  let d = {}; try { const j = e.data ? e.data.json() : {}; d = j.data || j.notification || j; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || 'Envanter', { body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || undefined, data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => { for (const c of l) if ('focus' in c) return c.focus(); return self.clients.openWindow(url); }));
});
