import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createMobileSupabaseClient, type SecureStorageAdapter } from '@actorrise/supabase/mobile';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loud in dev so the missing env is caught immediately.
  // In a real build EAS injects EXPO_PUBLIC_* at bundle time.
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is missing.',
  );
}

const secureStorage: SecureStorageAdapter = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

export const supabase = createMobileSupabaseClient({
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
  storage: secureStorage,
});
