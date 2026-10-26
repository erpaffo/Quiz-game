// Service Worker leggero per rendere la Web App installabile su iPhone (Safari) e Android.
// Usa strategia Network-First per garantire sempre codice e stato aggiornati quando c'è rete,
// con fallback alla cache per l'avvio rapido dell'interfaccia e dei giochi Passa-il-Telefono.

const CACHE_NAME = 'party-hub-v1';
const PRECACHE_URLS = ['/index.html', '/controller.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Non intercettare mai WebSocket (socket.io) o chiamate API dinamiche
  if (req.method !== 'GET' || url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/api')) {
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});

