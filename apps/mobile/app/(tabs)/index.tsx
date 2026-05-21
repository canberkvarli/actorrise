import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const debouncedQuery = useDebounced(query, 350);

  const filters = useMemo(() => ({ q: debouncedQuery, limit: 30 }), [debouncedQuery]);
  const { data, isLoading, isFetching, error } = useMonologueSearch({ filters });

  const results = data?.results ?? [];
  const showLoading = isLoading || (isFetching && results.length === 0);
  const loadingMessage = useMemo(
    () => LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)],
    [showLoading],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 pt-2 pb-3">
        <Text className="text-3xl font-bold text-foreground mb-3">Search</Text>
        <SearchInput value={query} onChangeText={setQuery} />
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
              {debouncedQuery
                ? `${data?.total ?? results.length} ${
                    (data?.total ?? results.length) === 1 ? 'monologue' : 'monologues'
                  }`
                : 'Recommended for you'}
            </Text>
          }
          ListEmptyComponent={
            <Text className="text-center text-muted-foreground mt-12 text-base">
              No monologues match that search.
            </Text>
          }
        />
      )}
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
