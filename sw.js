// Uygulamanın telefona kurulabilmesi için. Her zaman ağdan yükler (güncellemeler hemen gelsin).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
