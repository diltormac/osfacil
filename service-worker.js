/* ============================================================
   Service Worker — OS Fácil (Pré-Cadastro)
   Atualização Automática (Network First)
   ============================================================ */

// Gera um hash único a cada instalação para forçar a atualização
const CACHE_NAME = `osfacil-precadastro-${new Date().getTime()}`;
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(CORE_ASSETS);
      })
      .catch((err) => console.warn("Falha no pré-cache:", err)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key); // Limpa caches antigos
            }
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Ignora chamadas externas (Supabase, CDNs do Tailwind, FontAwesome, etc.)
  if (url.origin !== self.location.origin) return;

  // Estratégia Network First (Tenta internet primeiro, depois o cache)
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => {
        return caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.destination === "document") {
            return caches.match("./index.html");
          }
        });
      }),
  );
});
