import type { Monologue, SearchFilters } from '@actorrise/types';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  Layout,
} from 'react-native-reanimated';

import { FiltersModal } from '@/components/search/FiltersModal';
import { MonologueCard } from '@/components/search/MonologueCard';
import { SearchInput } from '@/components/search/SearchInput';
import { SearchLoading } from '@/components/search/SearchLoading';
import { useDebounced } from '@/hooks/use-debounced';
import { useMonologueSearch } from '@/hooks/use-monologue-search';

const QUICK_PROMPTS = [
  'Classical, female 20s',
  'Comedic monologue under 90 seconds',
  'Dramatic, male 30s, anger',
  'Shakespeare, soliloquy',
  'Contemporary, female 40s',
  'Funny, fresh material',
] as const;

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({ limit: 30 });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debouncedQuery = useDebounced(query, 350);
  const activeFilterCount = countFilters(filters);
  const hasInput = debouncedQuery.trim().length > 0 || activeFilterCount > 0;

  const searchFilters = useMemo(
    () => ({ ...filters, q: debouncedQuery }),
    [filters, debouncedQuery],
  );

  const { data, isLoading, isFetching, error } = useMonologueSearch({
    filters: searchFilters,
    enabled: hasInput,
  });

  const results = data?.results ?? [];
  const showLoading = hasInput && (isLoading || (isFetching && results.length === 0));

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {hasInput ? (
        <ActiveSearch
          query={query}
          onChangeQuery={setQuery}
          activeFilterCount={activeFilterCount}
          onOpenFilters={() => setFiltersOpen(true)}
          showLoading={showLoading}
          error={error}
          results={results}
          total={data?.total ?? results.length}
        />
      ) : (
        <HeroSearch
          query={query}
          onChangeQuery={setQuery}
          activeFilterCount={activeFilterCount}
          onOpenFilters={() => setFiltersOpen(true)}
          onPickPrompt={(prompt) => setQuery(prompt)}
        />
      )}

      <FiltersModal
        visible={filtersOpen}
        initial={filters}
        onClose={() => setFiltersOpen(false)}
        onApply={(next) => setFilters({ ...next, limit: 30 })}
      />
    </SafeAreaView>
  );
}

function HeroSearch({
  query,
  onChangeQuery,
  activeFilterCount,
  onOpenFilters,
  onPickPrompt,
}: {
  query: string;
  onChangeQuery: (next: string) => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  onPickPrompt: (prompt: string) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled">
      <Animated.View
        entering={FadeIn.duration(400)}
        exiting={FadeOut.duration(200)}
        layout={Layout.springify().damping(18)}
        className="flex-1 justify-center pt-10 pb-8">
        <Animated.View entering={FadeInUp.duration(450).delay(50)}>
          <Text className="text-xs font-semibold text-brand uppercase tracking-widest mb-2 text-center">
            Powered by AI
          </Text>
        </Animated.View>
        <Animated.View entering={FadeInUp.duration(500).delay(120)}>
          <Text className="text-[32px] font-bold text-foreground text-center leading-[38px] mb-2">
            Find your{'\n'}next monologue
          </Text>
        </Animated.View>
        <Animated.View entering={FadeInUp.duration(500).delay(200)}>
          <Text className="text-sm text-muted-foreground text-center mb-7 leading-5 px-2">
            Search in plain English. The AI knows the catalogue, the casting breakdowns, and what’s
            overdone.
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInUp.duration(500).delay(280)}
          className="flex-row gap-2 mb-6">
          <View className="flex-1">
            <SearchInput value={query} onChangeText={onChangeQuery} />
          </View>
          <Pressable
            onPress={onOpenFilters}
            className="bg-card border border-border rounded-xl px-4 items-center justify-center active:opacity-70">
            <Text className="text-foreground font-medium">
              {activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : 'Filters'}
            </Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(500).delay(360)}>
          <Text className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-3 text-center">
            Try
          </Text>
          <View className="flex-row flex-wrap gap-2 justify-center">
            {QUICK_PROMPTS.map((p, i) => (
              <Animated.View
                key={p}
                entering={FadeInDown.duration(400).delay(420 + i * 50)}>
                <Pressable
                  onPress={() => onPickPrompt(p)}
                  className="bg-card border border-border px-3.5 py-2 active:opacity-70">
                  <Text className="text-sm text-foreground">{p}</Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </ScrollView>
  );
}

function ActiveSearch({
  query,
  onChangeQuery,
  activeFilterCount,
  onOpenFilters,
  showLoading,
  error,
  results,
  total,
}: {
  query: string;
  onChangeQuery: (next: string) => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  showLoading: boolean;
  error: unknown;
  results: Monologue[];
  total: number;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      exiting={FadeOut.duration(180)}
      style={{ flex: 1 }}>
      <View className="px-5 pt-2 pb-3">
        <View className="flex-row gap-2">
          <View className="flex-1">
            <SearchInput value={query} onChangeText={onChangeQuery} />
          </View>
          <Pressable
            onPress={onOpenFilters}
            className="bg-card border border-border rounded-xl px-4 items-center justify-center active:opacity-70">
            <Text className="text-foreground font-medium">
              {activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : 'Filters'}
            </Text>
          </Pressable>
        </View>
      </View>

      {showLoading ? (
        <SearchLoading />
      ) : error ? (
        <ErrorState message={error instanceof Error ? error.message : 'Search failed.'} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(m) => String(m.id)}
          renderItem={({ item, index }) => <MonologueCard monologue={item} rank={index} />}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 4 }}
          ListHeaderComponent={
            <Text className="text-xs text-muted-foreground mb-3">
              {total} {total === 1 ? 'monologue' : 'monologues'}
            </Text>
          }
          ListEmptyComponent={
            <Animated.View entering={FadeIn.duration(280).delay(100)}>
              <Text className="text-center text-muted-foreground mt-12 text-base">
                No monologues match. Try fewer filters.
              </Text>
            </Animated.View>
          }
          keyboardDismissMode="on-drag"
        />
      )}
    </Animated.View>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Animated.View entering={FadeIn.duration(280)} className="flex-1 items-center justify-center px-8">
      <Text className="text-base font-semibold text-foreground mb-2">Something went wrong</Text>
      <Text className="text-sm text-muted-foreground text-center">{message}</Text>
    </Animated.View>
  );
}

function countFilters(f: SearchFilters): number {
  let n = 0;
  if (f.gender) n++;
  if (f.age_range) n++;
  if (f.emotion) n++;
  if (f.tone) n++;
  if (f.theme) n++;
  if (f.difficulty) n++;
  if (f.max_duration) n++;
  return n;
}
