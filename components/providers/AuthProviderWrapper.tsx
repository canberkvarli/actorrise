"use client";

import { AuthProvider } from "@/lib/auth";
import { QueryClient } from "@tanstack/react-query";
import type { Persister } from "@tanstack/react-query-persist-client";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { useState, useMemo } from "react";

const PERSIST_CACHE_MAX_AGE = 1000 * 60 * 60 * 24; // 24 hours

const defaultOptions = {
  queries: {
    staleTime: 2 * 60 * 1000,
    gcTime: PERSIST_CACHE_MAX_AGE, // match maxAge so persisted cache isn't GC'd before expiry
    refetchOnWindowFocus: true,
    retry: 1,
  },
};

const noopPersister: Persister = {
  persistClient: () => Promise.resolve(),
  restoreClient: () => Promise.resolve(undefined),
  removeClient: () => Promise.resolve(),
};

function createSessionStoragePersister(): Persister {
  if (typeof window === "undefined") return noopPersister;
  return createAsyncStoragePersister({
    storage: {
      getItem: (key: string) => Promise.resolve(window.sessionStorage.getItem(key)),
      setItem: (key: string, value: string) => {
        window.sessionStorage.setItem(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        window.sessionStorage.removeItem(key);
        return Promise.resolve();
      },
    },
    key: "actorrise-react-query-cache",
    throttleTime: 1000,
  });
}

export function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions }));
  const persister = useMemo(() => createSessionStoragePersister(), []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_CACHE_MAX_AGE,
      }}
    >
      <AuthProvider>{children}</AuthProvider>
    </PersistQueryClientProvider>
  );
}
