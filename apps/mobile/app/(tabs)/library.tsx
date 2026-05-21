import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MonologueCard } from '@/components/search/MonologueCard';
import { useBookmarks } from '@/hooks/use-bookmarks';

const SORT_OPTIONS = [
  { key: 'last_added', label: 'Recently saved' },
  { key: 'character_az', label: 'Character A–Z' },
  { key: 'play_az', label: 'Play A–Z' },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]['key'];

export default function LibraryScreen() {
  const [sort, setSort] = useState<SortKey>('last_added');
  const { data: favorites = [], isLoading, refetch, isRefetching } = useBookmarks();

  const sorted = sortMonologues(favorites, sort);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 pt-2 pb-3">
        <Text className="text-3xl font-bold text-foreground mb-3">Library</Text>
        <View className="flex-row gap-2">
          {SORT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => setSort(opt.key)}
              className={`px-3.5 py-2 border active:opacity-70 ${
                sort === opt.key
                  ? 'bg-brand/10 border-brand'
                  : 'bg-card border-border'
              }`}>
              <Text
                className={`text-sm font-medium ${
                  sort === opt.key ? 'text-brand' : 'text-muted-foreground'
                }`}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#CB4B00" />
        </View>
      ) : sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(m) => String(m.id)}
          renderItem={({ item, index }) => <MonologueCard monologue={item} rank={index} />}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          ListHeaderComponent={
            <Text className="text-xs text-muted-foreground mb-3">
              {sorted.length} saved
            </Text>
          }
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#CB4B00" />
          }
        />
      )}
    </SafeAreaView>
  );
}

function EmptyState() {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-xl font-semibold text-foreground mb-2">No monologues yet</Text>
      <Text className="text-sm text-muted-foreground text-center mb-6">
        Tap Save on any monologue to keep it here.
      </Text>
      <Pressable
        onPress={() => router.push('/(tabs)')}
        className="bg-brand rounded-xl px-5 py-3 active:opacity-80">
        <Text className="text-white font-semibold">Browse monologues</Text>
      </Pressable>
    </View>
  );
}

function sortMonologues<T extends { character_name: string; play_title: string }>(
  list: T[],
  sort: SortKey,
): T[] {
  if (sort === 'last_added') return list;
  const cmp = (a: T, b: T) => {
    if (sort === 'character_az') return a.character_name.localeCompare(b.character_name);
    if (sort === 'play_az') return a.play_title.localeCompare(b.play_title);
    return 0;
  };
  return [...list].sort(cmp);
}
