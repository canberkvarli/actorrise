/* ActorRise service worker — installable + offline shell. Dependency-free. */
/* Bump on any change to what is cached or how. The activate handler deletes
   every cache whose key is not this one, so a new name is the only thing that
   clears what a previous worker stored — and the name had never changed since
   the worker shipped, which meant the purge could never fire. */
const CACHE_NAME = "actorrise-v2";
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

  // Never cache anything that carries the app itself.
  //
  // This used to stale-while-revalidate every same-origin GET, which sounds
  // harmless for hashed build assets but is not: Next fetches an RSC payload on
  // every client-side navigation, at a plain page URL with `?_rsc=<buildId>`.
  // That is same-origin, GET, not /api/, and its mode is "cors" rather than
  // "navigate" — so it fell through to the branch below and came back from a
  // cache written by an older deploy. The document was fresh and the component
  // tree behind it was months old. On phones, where the worker sticks around
  // between visits, that showed up as the app simply not updating: a search
  // screen still running a loading checklist that no longer exists in the
  // codebase at all.
  //
  // Nothing about the running app is cached now. Only the offline shell and the
  // icons are, which is all the worker was ever installed for.
  if (
    url.pathname.startsWith("/_next/") ||
    url.searchParams.has("_rsc") ||
    request.headers.get("RSC") === "1" ||
    request.destination === "document" ||
    request.destination === "script"
  ) {
    return;
  }

  // Everything else same-origin: cache-first for the precached shell, straight
  // to the network otherwise.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch (_) {
        return Response.error();
      }
    })()
  );
});
