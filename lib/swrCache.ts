/**
 * localStorage-backed SWR cache provider.
 * Persists SWR cache across page refreshes so data loads instantly.
 */

import { currentLocale } from "@/lib/i18n";

const STORAGE_KEY = "swr-cache-v1";
const REACT_QUERY_CACHE_KEY = "actorrise-react-query-cache";

/**
 * The library is served in the UI's language (CAN-19): the Turkish UI gets
 * Turkish pieces only. So a cache written in one language must never be read
 * in the other. English keeps the key it always had.
 */
function storageKey(): string {
  const locale = currentLocale();
  return locale === "en" ? STORAGE_KEY : `${STORAGE_KEY}:${locale}`;
}

export function clearSwrCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(`${STORAGE_KEY}:tr`);
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
  const key = storageKey();
  try {
    const stored = localStorage.getItem(key);
    map = stored ? new Map(JSON.parse(stored) as [string, any][]) : new Map();
  } catch {
    map = new Map();
  }

  // Persist to localStorage before page unloads
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      // Switched language this visit: the map holds both, so keep neither.
      if (storageKey() !== key) return;
      try {
        // Only cache API data keys (skip internal SWR keys starting with "$")
        const entries = Array.from(map.entries()).filter(
          ([key]) => typeof key === "string" && key.startsWith("/api/")
        );
        localStorage.setItem(key, JSON.stringify(entries));
      } catch {
        // Storage full or unavailable — ignore
      }
    });
  }

  return map;
}
