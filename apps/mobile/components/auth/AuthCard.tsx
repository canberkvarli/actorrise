import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from './BrandLogo';
import { EmailForm } from './EmailForm';
import { OAuthButtons } from './OAuthButtons';

interface AuthCardProps {
  mode: 'signup' | 'login';
}

const COPY = {
  signup: {
    headline: 'Create your account',
    sub: 'Start free. Upgrade anytime.',
    emailCta: 'Continue with email',
    altPrompt: 'Already have an account?',
    altCta: 'Sign in',
    altHref: '/(auth)/sign-in' as const,
  },
  login: {
    headline: 'Welcome back',
    sub: 'Sign in to continue.',
    emailCta: 'Continue with email',
    altPrompt: "Don't have an account?",
    altCta: 'Sign up',
    altHref: '/(auth)/sign-up' as const,
  },
};

/**
 * Mirrors web's AuthProgressiveDisclosure: OAuth buttons visible first;
 * tapping "Continue with email" expands the email form inline.
 */
export function AuthCard({ mode }: AuthCardProps) {
  const [showEmail, setShowEmail] = useState(false);
  const copy = COPY[mode];

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 }}
          keyboardShouldPersistTaps="handled">
          <View className="bg-card border border-border rounded-2xl px-7 py-9 gap-7">
            <View className="items-center gap-3">
              <BrandLogo size="md" />
              <View className="items-center gap-1">
                <Text className="text-2xl font-bold text-foreground text-center">
                  {copy.headline}
                </Text>
                <Text className="text-sm text-muted-foreground text-center">{copy.sub}</Text>
              </View>
            </View>

            <OAuthButtons mode={mode} />

            <View className="flex-row items-center gap-3">
              <View className="flex-1 h-px bg-border" />
              <Text className="text-xs text-muted-foreground uppercase tracking-wide">or</Text>
              <View className="flex-1 h-px bg-border" />
            </View>

            {showEmail ? (
              <EmailForm mode={mode} />
            ) : (
              <Pressable
                onPress={() => setShowEmail(true)}
                className="border border-border rounded-xl py-3.5 items-center justify-center active:opacity-70">
                <Text className="text-foreground font-medium text-base">{copy.emailCta}</Text>
              </Pressable>
            )}

            <Text className="text-xs text-muted-foreground/70 text-center">
              By continuing, you agree to ActorRise&apos;s Terms of Service.
            </Text>
          </View>

          <View className="flex-row justify-center mt-6 gap-2">
            <Text className="text-sm text-muted-foreground">{copy.altPrompt}</Text>
            <Link href={copy.altHref} asChild>
              <Pressable>
                <Text className="text-sm font-medium text-brand">{copy.altCta}</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
