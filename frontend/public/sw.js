// Uygulama kabuğunu çevrimdışı açılabilir yapar. API yanıtları burada saklanmaz.
const CACHE = "blackrose-shell-v1";
const SHELL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    return;
  }
  if (event.request.mode === "navigate") {
    // Sayfa önce ağdan gelir, böylece yeni sürüm hemen görünür.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(SHELL, copy));
          }
          return response;
        })
        .catch(() => caches.match(SHELL)),
    );
    return;
  }
  // Derlenmiş dosyaların adı içeriğe göre değiştiği için önbellek güvenlidir.
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        }),
    ),
  );
});
