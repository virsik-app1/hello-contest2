/* PulseRetain service worker — network-first, so the app is always fresh and
   never serves stale content, but still works offline by falling back to the
   last-cached shell. Only same-origin GETs are touched; API POSTs to the Lambda
   are never intercepted. Lives in /public so CRA serves it as-is (no Workbox). */
const CACHE = "pulseretain-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;                       // never touch API POSTs
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;            // same-origin only (skip Lambda/CDNs)

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match("/index.html"))
      )
  );
});
