import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Dev-only quick sign-in. Renders ONLY when __DEV__ is true so it cannot
 * ship in a TestFlight or App Store build.
 *
 * Set EXPO_PUBLIC_DEV_EMAIL + EXPO_PUBLIC_DEV_PASSWORD in apps/mobile/.env.local
 * for one-tap sign-in. If either is missing the button shows an alert
 * explaining what to add.
 */
export function DevSignIn() {
  const [busy, setBusy] = useState(false);

  if (!__DEV__) return null;

  const email = process.env.EXPO_PUBLIC_DEV_EMAIL;
  const password = process.env.EXPO_PUBLIC_DEV_PASSWORD;

  async function signInAsDev() {
    if (!email || !password) {
      Alert.alert(
        'Dev creds missing',
        'Add EXPO_PUBLIC_DEV_EMAIL and EXPO_PUBLIC_DEV_PASSWORD to apps/mobile/.env.local, then reload.',
      );
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (e) {
      Alert.alert('Dev sign-in failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mt-4 border border-dashed border-brand/40 rounded-xl px-4 py-3 bg-brand/5">
      <Text className="text-[10px] font-semibold text-brand uppercase tracking-wider mb-2">
        Dev only · not in production builds
      </Text>
      <Pressable
        onPress={signInAsDev}
        disabled={busy}
        className="bg-brand rounded-lg py-3 items-center justify-center active:opacity-80">
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text className="text-white font-semibold text-sm">
            Sign in as {email ?? '(set EXPO_PUBLIC_DEV_EMAIL)'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
