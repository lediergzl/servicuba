// Sube este número en CADA deploy que toque archivos de frontend/js o 
// frontend/css. Antes CACHE_NAME quedaba fijo entre despliegues: como el
// navegador sólo re-instala el service worker cuando ESTE archivo cambia
// byte a byte, un deploy que sólo tocara tasks.js/core.js/etc. nunca
// disparaba 'install' — el navegador seguía sirviendo los JS viejos desde
// caché indefinidamente, aunque el servidor ya tuviera el código nuevo.
// v8: se agregó frontend/js/landing.js (buscador instantáneo del hero).
// v9: fix en tasks.js — la ubicación GPS se pide en paralelo al llenar
// el formulario de "Nueva tarea"/"Publicar servicio", con reintento sin
// perder los datos si falla (antes se perdía todo lo escrito).
// v10: landing.js ahora revisa el token antes de mandar a "Regístrate"
// (si ya hay sesión, va directo al dashboard) y tasks.js precarga la
// categoría elegida en el buscador del hero al abrir "Nueva tarea".
const CACHE_VERSION = 'v10';
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

// Network-first para el app shell (HTML/JS/CSS/manifest): siempre intenta
// traer la versión más reciente del servidor primero, y sólo cae al caché
// si no hay red (modo offline). Esto evita el problema de fondo: con
// cache-first, un deploy nuevo de tasks.js/core.js/etc. quedaba invisible
// para cualquiera que ya tuviera la PWA instalada/visitada antes, hasta
// que ESTE archivo cambiara. Los íconos (que casi nunca cambian) se
// sirven cache-first para no gastar red en cada carga.
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
        // Guarda una copia fresca en caché para el modo offline, sin
        // bloquear la respuesta al usuario.
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ---------- Web Push ----------

self.addEventListener('push', event => {
  let data = { title: 'ServiCuba', body: 'Tienes una notificación nueva.', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    // payload no-JSON, se usan los valores por defecto
  }

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
