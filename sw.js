// Service worker de Pichanga Cerca.
// Estrategia "red primero": siempre intenta traer la versión más nueva y usa la copia
// guardada solo si no hay conexión. Solo cachea archivos propios (no Firebase ni mapas).
const CACHE = "pichanga-v1";
const BASE = ["./", "index.html", "app.js", "styles.css", "config.js", "manifest.webmanifest", "pwa.js", "icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match("./")))
  );
});
