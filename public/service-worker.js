const CACHE = "minhas-financas-assets-v3";
const OFFLINE_URL = "/offline.html";
const CORE_ASSETS = [OFFLINE_URL, "/manifest.webmanifest", "/favicon.svg", "/icon-192.png", "/icon-512.png"];
self.addEventListener("install", (event) => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(CORE_ASSETS);
  await self.skipWaiting();
})()));
self.addEventListener("activate", (event) => event.waitUntil((async () => { for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key); await self.clients.claim(); })()));
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  if (!(/\.(js|css|svg|png|woff2?)$/.test(url.pathname) || url.pathname.startsWith("/_next/static/") || CORE_ASSETS.includes(url.pathname))) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    const cacheControl = response.headers.get("cache-control") || "";
    if (response.ok && response.type === "basic" && !cacheControl.toLowerCase().includes("no-store")) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
