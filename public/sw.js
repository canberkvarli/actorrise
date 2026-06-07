/* ActorRise service worker — installable + offline shell. Dependency-free. */
const CACHE_NAME = "actorrise-v1";
const OFFLINE_URL = "/offline.html";

// App shell assets to precache. Keep this list to things we know exist in /public.
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        // addAll is atomic; cache items individually so one 404 doesn't abort install.
        await Promise.all(
          PRECACHE_URLS.map(async (url) => {
            try {
              await cache.add(new Request(url, { cache: "reload" }));
            } catch (_) {
              /* ignore individual asset failures */
            }
          })
        );
      } catch (_) {
        /* ignore precache failures */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys.map((key) => (key === CACHE_NAME ? null : caches.delete(key)))
        );
      } catch (_) {
        /* ignore cleanup failures */
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET; never touch POST/auth/other methods.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }

  // Same-origin only.
  if (url.origin !== self.location.origin) return;

  // Never cache API / auth requests.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return;
  }

  // Navigation requests: network-first, fall back to cache, then offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          return networkResponse;
        } catch (_) {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(request);
          if (cached) return cached;
          const offline = await cache.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response("You're offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }
      })()
    );
    return;
  }

  // Other same-origin GET assets: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => undefined);
      return cached || (await fetchPromise) || Response.error();
    })()
  );
});
