// Service worker di «Party Tascabile» (generato a ogni build da vite.pass.config.ts: NON modificare dist/pass/sw.js).
// Strategia «offline prima di tutto»: all'installazione salva TUTTI i file dell'app in una cache con la versione;
// da lì in poi l'app si apre dalla cache, anche in modalità aereo. Una build nuova = versione nuova = cache nuova.

const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = `tascabile-${VERSION}`;
const BASE = new URL('./', self.location).href;

self.addEventListener('install', (event) => {
  // niente skipWaiting automatico: se c'è già una versione attiva, quella nuova aspetta che l'utente tocchi «aggiorna»
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([BASE, ...FILES.map((f) => BASE + f)])));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tascabile-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(BASE)) return;

  // Apertura di una pagina dell'app: sempre la index.html della versione installata.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then((cache) => cache.match(BASE + 'index.html').then((hit) => hit || fetch(req)))
    );
    return;
  }

  // File dell'app: dalla cache; se manca (non dovrebbe), dalla rete salvandolo per la prossima volta.
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && res.type === 'basic') cache.put(req, res.clone());
            return res;
          })
      )
    )
  );
});
