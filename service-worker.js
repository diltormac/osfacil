/* =========================================================
   SERVICE WORKER — OS Fácil (Pré-Cadastro)
   Estratégias:
   - App shell (HTML/JS/CSS local) → stale-while-revalidate
   - CDNs versionadas → cache-first
   - Supabase REST/RPC → network-first com fallback cache
   - Navegação (HTML) → network-first com fallback cache
   ========================================================= */

const VERSAO = "v11"; // <-- Mude para v2, v3, etc. quando alterar o código
const CACHE_SHELL = `precadastro-shell-${VERSAO}`;
const CACHE_CDN = `precadastro-cdn-${VERSAO}`;
const CACHE_API = `precadastro-api-${VERSAO}`;

// Tempo máximo que o SW espera a rede antes de usar cache (ms)
const TIMEOUT_REDE = 5000;

// Arquivos locais do seu formulário
const ASSETS_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
  "./js/camera.js",
  "./js/database.js",
  "./js/dropdownCustom.js",
  "./js/supabase.js",
  "./favicon-32x32.png",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png",
];

// Bibliotecas externas (versões fixas → cache-first)
const ASSETS_CDN = [
  "https://cdn.tailwindcss.com/",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/webfonts/fa-solid-900.woff2",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/webfonts/fa-regular-400.woff2",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
];

const SUPABASE_HOST = "kiiswukzwwoznkgjyaod.supabase.co";

/* ---------- INSTALL ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cacheShell = await caches.open(CACHE_SHELL);
      await Promise.all(
        ASSETS_SHELL.map((url) =>
          cacheShell.add(url).catch((err) => {
            console.warn("[SW] Falha ao cachear (shell):", url, err);
          }),
        ),
      );

      const cacheCdn = await caches.open(CACHE_CDN);
      await Promise.all(
        ASSETS_CDN.map((url) =>
          cacheCdn.add(new Request(url, { mode: "cors" })).catch((err) => {
            console.warn("[SW] Falha ao cachear (cdn):", url, err);
          }),
        ),
      );

      // Atualiza imediatamente
      self.skipWaiting();
    })(),
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Apaga caches de versões antigas
      const nomes = await caches.keys();
      await Promise.all(
        nomes.filter((n) => !n.endsWith(VERSAO)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/* ---------- FETCH ---------- */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Só lidamos com GET (POST de cadastro sempre passa direto)
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 1) API do Supabase → network-first com fallback cache
  if (url.hostname === SUPABASE_HOST && url.pathname.startsWith("/rest/")) {
    event.respondWith(networkFirstComCache(req, CACHE_API, 8000));
    return;
  }

  // 2) Storage do Supabase (imagens da busca) → cache-first
  if (url.hostname === SUPABASE_HOST && url.pathname.startsWith("/storage/")) {
    event.respondWith(cacheFirst(req, CACHE_CDN));
    return;
  }

  // 3) Navegação (HTML) → network-first com fallback cache
  if (req.mode === "navigate") {
    event.respondWith(navegacaoNetworkFirst(req));
    return;
  }

  // 4) CDNs externas → cache-first
  if (ASSETS_CDN.some((u) => req.url.startsWith(u.split("?")[0]))) {
    event.respondWith(cacheFirst(req, CACHE_CDN));
    return;
  }

  // 5) Assets locais (mesma origem) → stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, CACHE_SHELL));
    return;
  }
});

/* ---------- ESTRATÉGIAS ---------- */

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return new Response("", { status: 504, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);

  const fetchPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || new Response("", { status: 504 });
}

async function networkFirstComCache(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(req, { signal: controller.signal });
    clearTimeout(timer);

    if (res && res.ok) {
      cache.put(req, res.clone());
      return res;
    }
    const cached = await cache.match(req);
    if (cached) return cached;
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: "offline", message: "Sem conexão." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
}

async function navegacaoNetworkFirst(req) {
  const cache = await caches.open(CACHE_SHELL);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_REDE);
    const res = await fetch(req, { signal: controller.signal });
    clearTimeout(timer);

    if (res && res.ok) {
      cache.put(req, res.clone());
      return res;
    }
    throw new Error("Não OK");
  } catch (err) {
    const cached =
      (await cache.match(req)) || (await cache.match("./index.html"));
    if (cached) return cached;
    return new Response("<h1>Offline</h1><p>Sem conexão com a internet.</p>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status: 503,
    });
  }
}
