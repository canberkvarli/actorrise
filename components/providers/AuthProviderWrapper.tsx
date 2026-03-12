"use client";

import { AuthProvider } from "@/lib/auth";
import { QueryClient, QueryClientProvider, hydrate, dehydrate } from "@tanstack/react-query";
import { useState, useEffect } from "react";

const REACT_QUERY_CACHE_KEY = "actorrise-react-query-cache";
const PERSIST_CACHE_MAX_AGE = 1000 * 60 * 60 * 24; // 24 hours

const defaultOptions = {
  queries: {
    staleTime: 2 * 60 * 1000,
    gcTime: PERSIST_CACHE_MAX_AGE,
    refetchOnWindowFocus: true,
    retry: 1,
  },
};

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
  }

  return client;
}

export function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  // Persist cache to localStorage before page unloads
  useEffect(() => {
    const persist = () => {
      try {
        const state = dehydrate(queryClient);
        localStorage.setItem(
          REACT_QUERY_CACHE_KEY,
          JSON.stringify({ clientState: state, timestamp: Date.now() })
        );
      } catch {
        // Storage full or unavailable — ignore
      }
    };

    window.addEventListener("beforeunload", persist);
    return () => window.removeEventListener("beforeunload", persist);
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
