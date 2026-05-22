import type { SearchFilters } from '@actorrise/types';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

  // Only hit the AI search when the user has actually typed or filtered.
  // Empty state shows quick prompts, not an auto-loaded recommendation feed.
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
      <View className="flex-1 justify-center pt-12 pb-8">
        <Text className="text-xs font-semibold text-brand uppercase tracking-widest mb-2 text-center">
          Powered by AI
        </Text>
        <Text className="text-3xl font-bold text-foreground text-center leading-9 mb-2">
          Find your{'\n'}next monologue
        </Text>
        <Text className="text-sm text-muted-foreground text-center mb-7 leading-5">
          Search in plain English. The AI knows the catalogue, the casting{' '}
          {'\n'}breakdowns, and what’s overdone.
        </Text>

        <View className="flex-row gap-2 mb-5">
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

        <Text className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-3 text-center">
          Try
        </Text>
        <View className="flex-row flex-wrap gap-2 justify-center">
          {QUICK_PROMPTS.map((p) => (
            <Pressable
              key={p}
              onPress={() => onPickPrompt(p)}
              className="bg-card border border-border px-3.5 py-2 active:opacity-70">
              <Text className="text-sm text-foreground">{p}</Text>
            </Pressable>
          ))}
        </View>
      </View>
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
  results: import('@actorrise/types').Monologue[];
  total: number;
}) {
  return (
    <>
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
            <Text className="text-center text-muted-foreground mt-12 text-base">
              No monologues match. Try fewer filters.
            </Text>
          }
          keyboardDismissMode="on-drag"
        />
      )}
    </>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-base font-semibold text-foreground mb-2">Something went wrong</Text>
      <Text className="text-sm text-muted-foreground text-center">{message}</Text>
    </View>
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
