// Funziona anche offline: prova la rete, se non c'è usa la copia salvata.
const CACHE = 'idraulico-v19';
const CAL = 'idraulico-cal'; // file calendario creati dall'app
const FILES = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './preventivi.js', './vendor/jspdf.umd.min.js', './promemoria.js', './dacomprare.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== CAL).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  if (new URL(e.request.url).pathname.endsWith('version.txt')) return; // sempre dalla rete
  if (new URL(e.request.url).pathname.includes('/cal/')) { // file .ics da aprire nel Calendario
    e.respondWith(caches.open(CAL).then(c => c.match(e.request.url)).then(r => r || new Response('Non trovato', { status: 404 })));
    return;
  }
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
// Tocco su una notifica: apre (o porta davanti) l'app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(l => l.length ? l[0].focus() : self.clients.openWindow('./')));
});
