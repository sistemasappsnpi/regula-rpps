// Troque a versão ao publicar mudanças em assets/ para forçar a atualização nos navegadores.
const CACHE_NAME = "portal-transparencia-v1";
const APP_SHELL = ["./", "./assets/app.css", "./assets/app.js"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(APP_SHELL); })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

function networkFirst(req) {
  return fetch(req).then(function (res) {
    if (res.ok) {
      var copy = res.clone();
      caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
    }
    return res;
  }).catch(function () { return caches.match(req, { ignoreSearch: req.mode === "navigate" }); });
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Página (config pode mudar), proxy e dados: rede primeiro, cópia do cache se estiver offline.
  if (req.mode === "navigate" || url.pathname.indexOf(".php") !== -1 || url.pathname.indexOf("/dados/") !== -1) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Estáticos (css, js versionados por ?v=, imagens): cache primeiro.
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      });
    })
  );
});
