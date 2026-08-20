// v15: estrategia de carga tolerante a conexiones lentas.
// El shell crítico se instala sin bloquear por recursos secundarios.
const CACHE_VERSION = 'v15';
const CACHE_NAME = `servicuba-${CACHE_VERSION}`;

// Sólo recursos indispensables para arrancar la interfaz offline.
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
    // No usamos addAll: un único recurso lento o fallido no debe impedir
    // que el Service Worker complete la instalación.
    await Promise.allSettled(
      CORE_URLS.map(async url => {
        try {
          const response = await fetch(url, { cache: 'no-cache' });
          if (response && response.ok) await cache.put(url, response.clone());
        } catch (_) {
          // Se recuperará desde red o caché existente en la próxima petición.
        }
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

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  if (url.includes('/api/')) return; // nunca cachear datos autenticados

  const cacheFirst = CACHE_FIRST_PATTERNS.some(re => re.test(url));
  if (cacheFirst) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
    return;
  }

  // Para JS/CSS/HTML usamos stale-while-revalidate: la interfaz responde
  // inmediatamente desde caché y se actualiza en segundo plano.
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
          return response;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return (await network) || cached || Response.error();
    })());
    return;
  }

  // Recursos no críticos: red primero y fallback a caché.
  event.respondWith(
    fetch(event.request)
      .then(async response => {
        if (response && response.ok && new URL(url).origin === self.location.origin) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
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
