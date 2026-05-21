import type { SearchFilters } from '@actorrise/types';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FiltersModal } from '@/components/search/FiltersModal';
import { MonologueCard } from '@/components/search/MonologueCard';
import { SearchInput } from '@/components/search/SearchInput';
import { useDebounced } from '@/hooks/use-debounced';
import { useMonologueSearch } from '@/hooks/use-monologue-search';

const LOADING_MESSAGES = [
  'Asking Shakespeare…',
  'Rifling through the script pile…',
  'Consulting drama gods…',
  'Finding ones that’ll stop the room…',
];

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({ limit: 30 });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debouncedQuery = useDebounced(query, 350);
  const activeFilters = useMemo(
    () => ({ ...filters, q: debouncedQuery }),
    [filters, debouncedQuery],
  );

  const { data, isLoading, isFetching, error } = useMonologueSearch({ filters: activeFilters });

  const results = data?.results ?? [];
  const showLoading = isLoading || (isFetching && results.length === 0);
  const loadingMessage = useMemo(
    () => LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)],
    [showLoading],
  );

  const activeFilterCount = countFilters(filters);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 pt-2 pb-3">
        <Text className="text-3xl font-bold text-foreground mb-3">Search</Text>
        <View className="flex-row gap-2">
          <View className="flex-1">
            <SearchInput value={query} onChangeText={setQuery} />
          </View>
          <Pressable
            onPress={() => setFiltersOpen(true)}
            className="bg-card border border-border rounded-xl px-4 items-center justify-center active:opacity-70">
            <Text className="text-foreground font-medium">
              {activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : 'Filters'}
            </Text>
          </Pressable>
        </View>
      </View>

      {showLoading ? (
        <View className="flex-1 items-center justify-center px-8">
          <ActivityIndicator size="small" color="#CB4B00" />
          <Text className="text-sm text-muted-foreground mt-3">{loadingMessage}</Text>
        </View>
      ) : error ? (
        <ErrorState message={error instanceof Error ? error.message : 'Search failed.'} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(m) => String(m.id)}
          renderItem={({ item, index }) => <MonologueCard monologue={item} rank={index} />}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          ListHeaderComponent={
            <Text className="text-xs text-muted-foreground mb-3">
              {debouncedQuery || activeFilterCount > 0
                ? `${data?.total ?? results.length} ${
                    (data?.total ?? results.length) === 1 ? 'monologue' : 'monologues'
                  }`
                : 'Recommended for you'}
            </Text>
          }
          ListEmptyComponent={
            <Text className="text-center text-muted-foreground mt-12 text-base">
              No monologues match.
            </Text>
          }
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
