import { useMemo, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MonologueCard } from '@/components/search/MonologueCard';
import { MOCK_MONOLOGUES, type MockMonologue } from '@/lib/mock-monologues';

export default function SearchScreen() {
  const [query, setQuery] = useState('');

  const results = useMemo(() => filterMonologues(MOCK_MONOLOGUES, query), [query]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Try 'Shakespeare', 'comedy', or 'female 20s'…"
          placeholderTextColor="#999"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>
      <FlatList
        data={results}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MonologueCard monologue={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No monologues match that search.</Text>
        }
        ListHeaderComponent={
          <Text style={styles.resultsLabel}>
            {results.length} {results.length === 1 ? 'monologue' : 'monologues'} (mock data —
            real backend wires up in Phase 2)
          </Text>
        }
      />
    </SafeAreaView>
  );
}

function filterMonologues(all: MockMonologue[], q: string): MockMonologue[] {
  const trimmed = q.trim().toLowerCase();
  if (!trimmed) return all;
  return all.filter((m) => {
    const haystack = `${m.character} ${m.source} ${m.preview} ${m.genre} ${m.gender} ${m.ageRange}`.toLowerCase();
    return haystack.includes(trimmed);
  });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 32, fontWeight: '700', color: '#111', marginBottom: 14 },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  list: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24 },
  resultsLabel: { fontSize: 12, color: '#888', marginBottom: 12 },
  empty: { textAlign: 'center', color: '#999', marginTop: 48, fontSize: 15 },
});
