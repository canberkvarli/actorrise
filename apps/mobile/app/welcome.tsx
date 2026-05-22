import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

const { width } = Dimensions.get('window');

interface Slide {
  eyebrow: string;
  headline: string;
  body: string;
  cta?: string;
  target?: '/(tabs)' | '/(tabs)/profile';
}

const SLIDES: Slide[] = [
  {
    eyebrow: 'Welcome to ActorRise',
    headline: 'The stage is yours.',
    body:
      'ActorRise helps you find the perfect monologue for every audition. Powered by AI, built for actors.',
  },
  {
    eyebrow: 'Profile',
    headline: 'Your profile is your casting director.',
    body:
      'The more we know about you — age range, experience, type — the sharper our recommendations. Two minutes, tops.',
  },
  {
    eyebrow: 'MonologueMatch',
    headline: 'Your monologue is waiting.',
    body:
      'Search in plain English. “A dramatic monologue for a woman in her 30s, Chekhov.” We’ll find it.',
    cta: 'Start searching',
    target: '/(tabs)',
  },
];

export default function WelcomeScreen() {
  const [index, setIndex] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  function goTo(next: number) {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, next));
    setIndex(clamped);
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
  }

  async function dismiss(target: '/(tabs)' | '/(tabs)/profile') {
    if (dismissing) return;
    setDismissing(true);
    try {
      // Write directly to Supabase user_metadata so the AuthGate sees the
      // flag on next render. This is the source of truth; the web's
      // /api/auth/onboarding route writes the same field.
      await supabase.auth.updateUser({ data: { has_seen_welcome: true } });
      await supabase.auth.refreshSession();
    } catch {
      // Non-fatal. Worst case: user sees welcome again next session.
    }
    router.replace(target);
  }

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;
  const isFirst = index === 0;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row justify-end px-5 pt-2">
        <Pressable onPress={() => dismiss('/(tabs)')} disabled={dismissing}>
          <Text className="text-sm text-muted-foreground py-2">Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        className="flex-1">
        {SLIDES.map((s) => (
          <View key={s.headline} style={{ width }} className="justify-center px-8">
            <Text className="text-xs font-semibold text-brand uppercase tracking-widest mb-3">
              {s.eyebrow}
            </Text>
            <Text className="text-3xl font-bold text-foreground mb-4 leading-9">
              {s.headline}
            </Text>
            <Text className="text-base text-muted-foreground leading-6">{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View className="px-5 pb-4 gap-4">
        <View className="flex-row justify-center gap-1.5">
          {SLIDES.map((_, i) => (
            <View
              key={i}
              className={`h-1.5 rounded-full ${i === index ? 'w-6 bg-brand' : 'w-1.5 bg-border'}`}
            />
          ))}
        </View>

        <View className="flex-row gap-3">
          {!isFirst ? (
            <Pressable
              onPress={() => goTo(index - 1)}
              className="flex-1 border border-border rounded-xl py-3.5 items-center justify-center active:opacity-70">
              <Text className="text-foreground font-medium text-base">Back</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => {
              if (isLast) {
                dismiss(slide.target ?? '/(tabs)');
              } else {
                goTo(index + 1);
              }
            }}
            disabled={dismissing}
            className="flex-1 bg-brand rounded-xl py-3.5 items-center justify-center active:opacity-80">
            {dismissing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-white font-semibold text-base">
                {isLast ? slide.cta ?? 'Get started' : 'Next'}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
