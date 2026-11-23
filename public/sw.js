const CACHE = 'tg-team-shell-v9';
const SHELL = ['/app', '/app/mux', '/app/deck', '/app/clients', '/app/rolodex', '/app/inbox', '/manifest.webmanifest', '/tg-team-icon.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('tg-team-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate' && url.pathname.startsWith('/app')) {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) void caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match('/app/mux')) || (await caches.match('/app'))));
  }
});

// Show the encrypted notification preview; old payloads retain a useful fallback.
self.addEventListener('push', event => {
  let id = '', title = 'TG Team', body = 'New team update. Open your inbox to read it.';
  try {
    const data = event.data?.json();
    if (/^[a-f0-9-]{36}$/.test(data?.id)) id = data.id;
    if (typeof data?.title === 'string' && data.title.trim()) title = Array.from(data.title.trim()).slice(0,120).join('');
    if (typeof data?.body === 'string' && data.body.trim()) body = Array.from(data.body.trim()).slice(0,180).join('');
  } catch {}
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: '/tg-team-icon.png',
    badge: '/tg-team-icon.png', tag: id || 'tg-inbox', data: { url: '/app/inbox' },
  }).then(async () => {
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for (const client of windows) client.postMessage({type:'tg-inbox-push'});
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/app/inbox'));
});
