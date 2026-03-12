/**
 * localStorage-backed SWR cache provider.
 * Persists SWR cache across page refreshes so data loads instantly.
 */

const STORAGE_KEY = "swr-cache-v1";

export function clearSwrCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
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
