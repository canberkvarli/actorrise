/**
 * localStorage-backed SWR cache provider.
 * Persists SWR cache across page refreshes so data loads instantly.
 */

const STORAGE_KEY = "swr-cache-v1";
const REACT_QUERY_CACHE_KEY = "actorrise-react-query-cache";

export function clearSwrCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function clearReactQueryCache() {
  try {
    localStorage.removeItem(REACT_QUERY_CACHE_KEY);
  } catch {
    // ignore
  }
}

// User-specific query keys — must be cleared on login to prevent cross-user data leak.
// Shared keys (discover, discover-film-tv) are intentionally kept so cards render
// instantly from cache while fresh user-specific data loads in the background.
const USER_SPECIFIC_QUERY_KEYS = new Set([
  "profile",
  "profile-stats",
  "profile-form",
  "recommendations",
]);

export function clearUserSpecificQueryCache() {
  try {
    const raw = localStorage.getItem(REACT_QUERY_CACHE_KEY);
    if (!raw) return;
    const cache = JSON.parse(raw) as {
      clientState?: { queries?: Array<{ queryKey?: unknown[] }> };
    };
    if (cache?.clientState?.queries) {
      cache.clientState.queries = cache.clientState.queries.filter(
        (q) => !USER_SPECIFIC_QUERY_KEYS.has(q.queryKey?.[0] as string)
      );
      localStorage.setItem(REACT_QUERY_CACHE_KEY, JSON.stringify(cache));
    }
  } catch {
    // If parsing fails, fall back to full clear
    localStorage.removeItem(REACT_QUERY_CACHE_KEY);
  }
}

export function localStorageProvider() {
  // Hydrate from localStorage on init
  let map: Map<string, any>;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    map = stored ? new Map(JSON.parse(stored) as [string, any][]) : new Map();
  } catch {
    map = new Map();
  }

  // Persist to localStorage before page unloads
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      try {
        // Only cache API data keys (skip internal SWR keys starting with "$")
        const entries = Array.from(map.entries()).filter(
          ([key]) => typeof key === "string" && key.startsWith("/api/")
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      } catch {
        // Storage full or unavailable — ignore
      }
    });
  }

  return map;
}
