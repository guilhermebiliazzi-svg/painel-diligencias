// 09/11: service worker do painel — mostra as notificações (lead novo) e abre a tela certa no toque.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { corpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'REMAX Ville', {
    body: d.corpo || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag || undefined,
    renotify: !!d.tag, requireInteraction: true, data: { url: d.url || '/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const abertos = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of abertos) { if ('focus' in c) { await c.focus(); if ('navigate' in c) return c.navigate(url); return; } }
    return self.clients.openWindow(url);
  })());
});
