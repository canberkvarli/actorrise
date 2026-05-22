import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useScript } from '@/hooks/use-scripts';

export default function ScriptDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: script, isLoading, error } = useScript(id);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#CB4B00" />
      </SafeAreaView>
    );
  }

  if (error || !script) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-8">
        <Text className="text-base font-semibold text-foreground mb-1">Could not load</Text>
        <Text className="text-sm text-muted-foreground text-center">
          {error instanceof Error ? error.message : 'This script may have been removed.'}
        </Text>
      </SafeAreaView>
    );
  }

  const sceneTitles = script.scene_titles ?? [];

  return (
    <>
      <Stack.Screen options={{ title: script.title }} />
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16 }}>
          <Text className="text-2xl font-bold text-foreground">{script.title}</Text>
          {script.author ? (
            <Text className="text-sm text-muted-foreground mt-1">{script.author}</Text>
          ) : null}
          {script.description ? (
            <Text className="text-sm text-foreground/80 leading-5 mt-3">{script.description}</Text>
          ) : null}

          {script.characters?.length ? (
            <View className="mt-5">
              <Text className="text-xs uppercase tracking-widest text-muted-foreground mb-2 font-semibold">
                Characters ({script.characters.length})
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                {script.characters.map((char) => (
                  <View key={char.name} className="bg-muted px-3 py-1.5">
                    <Text className="text-sm font-medium text-foreground">{char.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View className="mt-6">
            <Text className="text-xs uppercase tracking-widest text-muted-foreground mb-3 font-semibold">
              Scenes ({script.num_scenes_extracted})
            </Text>
            {sceneTitles.length ? (
              sceneTitles.map((title, idx) => (
                <Pressable
                  key={`${idx}-${title}`}
                  onPress={() => router.push(`/scenes/${idx + 1}/rehearse?script=${script.id}`)}
                  className="bg-card border border-border rounded-xl px-5 py-4 mb-2.5 active:opacity-80">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                      <Text className="text-xs text-muted-foreground mb-1">
                        Scene {idx + 1}
                      </Text>
                      <Text className="text-base font-medium text-foreground" numberOfLines={2}>
                        {title}
                      </Text>
                    </View>
                    <Text className="text-muted-foreground text-base">›</Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <Text className="text-sm text-muted-foreground">
                No scenes have been extracted yet.
              </Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
