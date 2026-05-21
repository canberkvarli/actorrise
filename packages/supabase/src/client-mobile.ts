import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@actorrise/types";

/**
 * Storage adapter interface — pass an expo-secure-store-backed implementation
 * from apps/mobile. Kept abstract so this package does not depend on Expo.
 */
export interface SecureStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface MobileClientOptions {
  url: string;
  anonKey: string;
  storage: SecureStorageAdapter;
}

/**
 * Build a Supabase client for React Native / Expo.
 *
 * Caller must pass a storage adapter wired to expo-secure-store. The adapter
 * lives in apps/mobile so this package stays free of Expo peer deps.
 *
 * `detectSessionInUrl: false` — RN does not auto-parse URL fragments. The
 * mobile app handles OAuth deep links explicitly via expo-linking.
 */
export function createMobileSupabaseClient(
  options: MobileClientOptions,
): SupabaseClient<Database> {
  return createClient<Database>(options.url, options.anonKey, {
    auth: {
      storage: options.storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}
