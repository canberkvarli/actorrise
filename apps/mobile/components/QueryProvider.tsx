import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '@/lib/query-client';

/**
 * In-memory only for now. AsyncStorage persistence will be re-enabled in
 * Phase 2 — under Expo SDK 54 + new arch, the legacy storage migration in
 * @react-native-async-storage/async-storage hits a "Native module is null"
 * crash on first launch. We do not need offline cache for the search UI
 * we're shipping today, so dropping the persister unblocks the app.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
