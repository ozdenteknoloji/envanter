// Telefona kurulabilmesi için + anlık bildirimler. Sayfalar her zaman ağdan yüklenir (güncellemeler hemen gelsin).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
self.addEventListener('push', e => {
  let d = {}; try { const j = e.data ? e.data.json() : {}; d = j.data || j.notification || j; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || 'Envanter', { body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || undefined, data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const hedef = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const l = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const q = new URL(hedef).search;
    for (const c of l) { try { await c.focus(); c.postMessage({ git: q }); return; } catch (_) {} }
    await self.clients.openWindow(hedef);
  })());
});
