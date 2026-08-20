// Sube este número en CADA deploy que toque archivos de frontend/js o 
// frontend/css. El app shell usa network-first, pero cambiar la versión
// fuerza además la instalación de un nuevo service worker y elimina caches
// anteriores, evitando que una PWA instalada conserve una versión vieja.
// v13: directorio público — avatar con inicial, oculta rating 0.0 falso
// ("Nuevo en ServiCuba" en su lugar), excluye cuenta admin de listados
// públicos (backend).
const CACHE_VERSION = 'v13';
const CACHE_NAME = `servicuba-${CACHE_VERSION}`;

const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/core.js',
  '/js/auth.js',
  '/js/tasks.js',
  '/js/chat.js',
  '/js/push.js',
  '/js/verification.js',
  '/js/monetization.js',
  '/js/admin.js',
  '/js/map.js',
  '/js/utils.js',
  '/js/landing.js',
  '/manifest.json',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Network-first para el app shell: siempre intenta traer la versión más
// reciente del servidor primero y sólo cae al caché si no hay red.
const CACHE_FIRST_PATTERNS = [/\/assets\/icons\//];

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (url.includes('/api/')) return; // nunca cachear la API ni el WS de chat

  const useCacheFirst = CACHE_FIRST_PATTERNS.some(re => re.test(url));

  if (useCacheFirst) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', event => {
  let data = { title: 'ServiCuba', body: 'Tienes una notificación nueva.', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {}

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