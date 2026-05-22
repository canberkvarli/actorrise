import '../global.css';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import 'react-native-reanimated';

// Silence noisy 'Cannot find native module' errors from optional Expo
// modules (ExpoLocation, ExpoPushTokenManager) that we don't use directly
// but get probed during init. Real errors still surface.
if (__DEV__) {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (
      first instanceof Error &&
      /Cannot find native module 'Expo(Location|PushTokenManager)'/.test(first.message)
    ) {
      return;
    }
    if (
      typeof first === 'string' &&
      /Cannot find native module 'Expo(Location|PushTokenManager)'/.test(first)
    ) {
      return;
    }
    originalError(...args);
  };
}

import { QueryProvider } from '@/components/QueryProvider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/use-auth';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <QueryProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthGate>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="(auth)"
              options={{ headerShown: false, presentation: 'modal', gestureEnabled: false }}
            />
            <Stack.Screen
              name="welcome"
              options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
            />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
        </AuthGate>
        <StatusBar style="auto" />
      </ThemeProvider>
    </QueryProvider>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { session, isLoading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    const root = segments[0];
    const inAuth = root === '(auth)';
    const inWelcome = root === 'welcome';
    const hasSeenWelcome = session?.user.user_metadata?.has_seen_welcome === true;

    if (!session) {
      if (!inAuth) router.replace('/(auth)/sign-in');
      return;
    }

    if (inAuth) {
      router.replace(hasSeenWelcome ? '/(tabs)' : '/welcome');
      return;
    }

    if (!hasSeenWelcome && !inWelcome) {
      router.replace('/welcome');
    }
  }, [session, isLoading, segments]);

  return <>{children}</>;
}
