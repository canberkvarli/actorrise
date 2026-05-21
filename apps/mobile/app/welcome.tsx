import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const { width } = Dimensions.get('window');

interface Slide {
  eyebrow: string;
  headline: string;
  body: string;
  cta?: string;
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
    cta: 'Go to profile',
  },
  {
    eyebrow: 'MonologueMatch',
    headline: 'Your monologue is waiting.',
    body:
      'Search in plain English. “A dramatic monologue for a woman in her 30s, Chekhov.” We’ll find it.',
    cta: 'Start searching',
  },
];

export default function WelcomeScreen() {
  const [index, setIndex] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const slideX = useRef(new Animated.Value(0)).current;

  function advance(dir: 1 | -1) {
    const next = index + dir;
    if (next < 0 || next >= SLIDES.length) return;
    Animated.timing(slideX, {
      toValue: -next * width,
      duration: 300,
      useNativeDriver: true,
    }).start();
    setIndex(next);
  }

  async function dismiss(target: '/(tabs)' | '/(tabs)/profile') {
    setDismissing(true);
    try {
      await api.post('/api/auth/onboarding', { has_seen_welcome: true });
    } catch {
      // Non-fatal — flag will be re-tried next session. Still let the user in.
    }
    try {
      await supabase.auth.refreshSession();
    } catch {
      // Refresh failure is also non-fatal.
    }
    router.replace(target);
  }

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;
  const isFirst = index === 0;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6 justify-between">
        <View className="flex-row justify-end pt-2">
          <Pressable onPress={() => dismiss('/(tabs)')} disabled={dismissing}>
            <Text className="text-sm text-muted-foreground">Skip</Text>
          </Pressable>
        </View>

        <View className="flex-1 justify-center">
          <Animated.View
            style={{
              flexDirection: 'row',
              width: width * SLIDES.length,
              transform: [{ translateX: slideX }],
            }}>
            {SLIDES.map((s) => (
              <View key={s.headline} style={{ width: width - 48 }} className="px-2">
                <Text className="text-xs font-medium text-brand uppercase tracking-widest mb-3">
                  {s.eyebrow}
                </Text>
                <Text className="text-3xl font-bold text-foreground mb-4 leading-9">
                  {s.headline}
                </Text>
                <Text className="text-base text-muted-foreground leading-6">{s.body}</Text>
              </View>
            ))}
          </Animated.View>
        </View>

        <View className="gap-4 pb-4">
          <View className="flex-row justify-center gap-1.5">
            {SLIDES.map((_, i) => (
              <View
                key={i}
                className={`h-1.5 rounded-full ${
                  i === index ? 'w-6 bg-brand' : 'w-1.5 bg-border'
                }`}
              />
            ))}
          </View>

          <View className="flex-row gap-3">
            {!isFirst ? (
              <Pressable
                onPress={() => advance(-1)}
                className="flex-1 border border-border rounded-xl py-3.5 items-center justify-center active:opacity-70">
                <Text className="text-foreground font-medium text-base">Back</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => {
                if (isLast) {
                  dismiss(slide.cta === 'Go to profile' ? '/(tabs)/profile' : '/(tabs)');
                } else if (slide.cta === 'Go to profile') {
                  dismiss('/(tabs)/profile');
                } else {
                  advance(1);
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
      </View>
    </SafeAreaView>
  );
}
