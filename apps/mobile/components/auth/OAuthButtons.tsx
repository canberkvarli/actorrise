import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

interface OAuthButtonsProps {
  /** "signup" or "login" — only changes the button label */
  mode: 'signup' | 'login';
  onSuccess?: () => void;
}

/**
 * Mirrors the web's OAuthButtons: full-width Google + Apple buttons, dark
 * on light. Google goes through Supabase's OAuth redirect handled in a
 * native browser session; Apple uses expo-apple-authentication and
 * exchanges the identity token via signInWithIdToken.
 */
export function OAuthButtons({ mode, onSuccess }: OAuthButtonsProps) {
  const [busy, setBusy] = useState<null | 'google' | 'apple'>(null);

  async function signInWithGoogle() {
    setBusy('google');
    try {
      const redirectTo = Linking.createURL('/auth/callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) throw error ?? new Error('No OAuth URL');
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type === 'success') {
        const url = new URL(res.url);
        const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
        const params = new URLSearchParams(fragment);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          onSuccess?.();
        }
      }
    } catch (e) {
      Alert.alert(
        'Google sign-in unavailable',
        e instanceof Error ? e.message : 'Try email instead, or check Supabase Auth providers.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function signInWithApple() {
    setBusy('apple');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No identity token from Apple');
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
      onSuccess?.();
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Apple sign-in failed', err.message ?? 'Try again or use email.');
    } finally {
      setBusy(null);
    }
  }

  const label = mode === 'signup' ? 'Sign up' : 'Continue';

  return (
    <View className="gap-3">
      <Pressable
        onPress={signInWithGoogle}
        disabled={busy !== null}
        className="border border-border rounded-xl py-3.5 px-4 flex-row items-center justify-center active:opacity-70">
        <Text className="text-foreground font-medium text-base">
          {busy === 'google' ? 'Opening Google…' : `${label} with Google`}
        </Text>
      </Pressable>

      {Platform.OS === 'ios' ? (
        <Pressable
          onPress={signInWithApple}
          disabled={busy !== null}
          className="bg-black rounded-xl py-3.5 px-4 flex-row items-center justify-center active:opacity-70">
          <Text className="text-white font-medium text-base">
            {busy === 'apple' ? 'Signing in…' : `${label} with Apple`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
