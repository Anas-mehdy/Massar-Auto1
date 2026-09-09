const MASSAR_CACHE_PREFIX = "massar-pwa-";
const SHELL_CACHE = `${MASSAR_CACHE_PREFIX}offline-v1`;
const STATIC_CACHE = `${MASSAR_CACHE_PREFIX}static-v1`;
const OFFLINE_SHELL = "/offline.html";
const CORE_ASSETS = [OFFLINE_SHELL, "/offline.js", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(CORE_ASSETS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, STATIC_CACHE]);
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(MASSAR_CACHE_PREFIX) && !keep.has(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname === "/masar-icon.png" ||
      url.pathname === "/massar-pwa-192.png" ||
      url.pathname === "/massar-pwa-512.png" ||
      url.pathname === "/massar-apple-touch.png")
  );
}

async function staticCacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function navigationNetworkFirst(request) {
  try {
    // Authenticated HTML is deliberately never written to Cache Storage.
    return await fetch(request);
  } catch {
    const shell = await caches.match(OFFLINE_SHELL);
    if (shell) return shell;
    return new Response("Massar is offline and the local shell is not available yet.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache API/session/sync responses. They may contain tenant-scoped data.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigationNetworkFirst(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staticCacheFirst(request));
  }
});
