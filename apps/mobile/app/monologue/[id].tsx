import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMonologue } from '@/hooks/use-monologue';

export default function MonologueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: monologue, isLoading, error } = useMonologue(id);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#CB4B00" />
      </SafeAreaView>
    );
  }

  if (error || !monologue) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-base font-semibold text-foreground mb-1">Could not load monologue</Text>
        <Text className="text-sm text-muted-foreground text-center">
          {error instanceof Error ? error.message : 'Try going back and tapping again.'}
        </Text>
      </SafeAreaView>
    );
  }

  const meta = [
    `${monologue.word_count} words`,
    formatDuration(monologue.estimated_duration_seconds),
    monologue.character_gender || monologue.gender,
    monologue.character_age_range || monologue.age_range,
    monologue.tone,
    monologue.difficulty_level || monologue.difficulty,
  ].filter(Boolean);

  return (
    <>
      <Stack.Screen options={{ title: monologue.character_name, headerBackTitle: 'Back' }} />
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 20 }}>
          <Text className="text-3xl font-bold text-foreground mb-1">
            {monologue.character_name}
          </Text>
          <Text className="text-base text-muted-foreground mb-1">
            {monologue.play_title}
            {monologue.author ? ` · ${monologue.author}` : ''}
          </Text>
          <Text className="text-xs text-muted-foreground/80 mt-2">{meta.join(' · ')}</Text>

          {monologue.scene_description ? (
            <View className="mt-5 bg-muted rounded-xl px-4 py-3">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Scene
              </Text>
              <Text className="text-sm text-foreground/80 leading-5">
                {monologue.scene_description}
              </Text>
            </View>
          ) : null}

          <View className="mt-6">
            <Text className="text-base text-foreground leading-7">{monologue.text}</Text>
          </View>

          {monologue.themes?.length ? (
            <View className="mt-6 flex-row flex-wrap gap-2">
              {monologue.themes.map((theme) => (
                <View key={theme} className="bg-brand/10 px-3 py-1.5">
                  <Text className="text-xs font-medium text-brand uppercase tracking-wide">
                    {theme}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function formatDuration(seconds: number | undefined): string | undefined {
  if (!seconds) return undefined;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}
