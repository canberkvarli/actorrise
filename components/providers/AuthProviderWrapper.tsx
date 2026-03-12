"use client";

import { AuthProvider } from "@/lib/auth";
import { QueryClient, QueryClientProvider, hydrate, dehydrate } from "@tanstack/react-query";
import { useState, useEffect } from "react";

const REACT_QUERY_CACHE_KEY = "actorrise-react-query-cache";
const PERSIST_CACHE_MAX_AGE = 1000 * 60 * 60 * 24; // 24 hours
const PERSIST_THROTTLE_MS = 1000; // max one write per second

// When true, prevents beforeunload from re-persisting a cache that was just cleared (e.g. on sign-out).
let persistSuppressed = false;

/** Call before clearing the cache on sign-out so beforeunload doesn't re-persist stale data. */
export function suppressCachePersist() {
  persistSuppressed = true;
}

const defaultOptions = {
  queries: {
    staleTime: 2 * 60 * 1000,
    gcTime: PERSIST_CACHE_MAX_AGE,
    refetchOnWindowFocus: true,
    retry: 1,
  },
};

function persistCache(client: QueryClient) {
  if (persistSuppressed) return;
  try {
    const state = dehydrate(client);
    localStorage.setItem(
      REACT_QUERY_CACHE_KEY,
      JSON.stringify({ clientState: state, timestamp: Date.now() })
    );
  } catch {
    // Storage full or unavailable — ignore
  }
}

function createQueryClient(): QueryClient {
  const client = new QueryClient({ defaultOptions });

  // Synchronously hydrate from localStorage — no async delay, no isRestoring flash
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(REACT_QUERY_CACHE_KEY);
      if (raw) {
        const persisted = JSON.parse(raw) as { clientState?: unknown; timestamp?: number };
        const age = persisted.timestamp ? Date.now() - persisted.timestamp : 0;
        if (age < PERSIST_CACHE_MAX_AGE && persisted.clientState) {
          hydrate(client, persisted.clientState);
        }
      }
    } catch {
      // Corrupt cache — ignore, start fresh
    }

    // Subscribe to query cache and persist after each successful update (throttled)
    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    client.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.query.state.status === "success") {
        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = setTimeout(() => persistCache(client), PERSIST_THROTTLE_MS);
      }
    });
  }

  return client;
}

export function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  // Also persist on page unload as a safety net
  useEffect(() => {
    const onUnload = () => persistCache(queryClient);
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
