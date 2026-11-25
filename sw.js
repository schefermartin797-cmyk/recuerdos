// Service worker: primero la red (para que siempre veas la última versión) y, sin conexión, lo guardado.
<<<<<<< HEAD
const CACHE = "pod-v8";
=======
const CACHE = "pod-v6";
>>>>>>> 2f8a3a5b32cd2c4ebe251862b47986f1a4c1ca92
const SHELL = ["./", "index.html", "styles.css", "app.js", "firebase-config.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r).then((m) => m || caches.match("index.html")))
  );
});
