// v21: fix — el panel "ServiCuba activo" (saludo, estado, actividad)
// existía en una versión anterior de app.js pero se perdió al migrar a
// los módulos dashboard-*.js: el contenedor .dashboard-live nunca se
// montaba en el HTML, así que ensureKpiGrid/renderWorkspaceState no
// tenían dónde pintar. Restaurado como tarjeta de marca (dark card).
// Nunca devolvemos undefined desde un fetch handler.
const CACHE_VERSION = 'v21';
const CACHE_NAME = `servicuba-${CACHE_VERSION}`;

const CORE_URLS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/core.js',
  '/js/auth.js',
  '/manifest.json',
  '/assets/icons/icon-192.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(
      CORE_URLS.map(async url => {
        try {
          const response = await fetch(url, { cache: 'no-cache' });
          if (response && response.ok) await cache.put(url, response.clone());
        } catch (_) {}
      })
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

const CACHE_FIRST_PATTERNS = [/\/assets\/icons\//];
const APP_SHELL_PATTERNS = [/^https?:\/\/[^/]+\/$/, /\/index\.html$/, /\/css\//, /\/js\//, /\/manifest\.json$/];

// A fetch handler MUST always resolve to a Response (or throw/reject).
// caches.match() resolves undefined when the resource is absent, so every
// cache fallback below is normalized to a real Response.
const emptyCacheFallback = () => Response.error();

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  if (url.includes('/api/')) return;

  const cacheFirst = CACHE_FIRST_PATTERNS.some(re => re.test(url));
  if (cacheFirst) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        return response || emptyCacheFallback();
      } catch (_) {
        return emptyCacheFallback();
      }
    })());
    return;
  }

  const isAppShell = APP_SHELL_PATTERNS.some(re => re.test(url));
  if (isAppShell) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      const network = fetch(event.request)
        .then(async response => {
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, response.clone());
          }
          return response || emptyCacheFallback();
        })
        .catch(() => emptyCacheFallback());

      if (cached) {
        event.waitUntil(network.catch(() => undefined));
        return cached;
      }
      return network;
    })());
    return;
  }

  // Recursos no críticos: red primero y fallback seguro a caché.
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response && response.ok && new URL(url).origin === self.location.origin) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response || (await caches.match(event.request)) || emptyCacheFallback();
    } catch (_) {
      return (await caches.match(event.request)) || emptyCacheFallback();
    }
  })());
});

self.addEventListener('push', event => {
  let data = { title: 'ServiCuba', body: 'Tienes una notificación nueva.', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/assets/icons/icon-192.png',
      badge: '/assets/icons/icon-192.png',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      const existing = clientsArr.find(c => 'focus' in c);
      if (existing) {
        existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
