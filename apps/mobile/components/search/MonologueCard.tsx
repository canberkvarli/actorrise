import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MockMonologue } from '@/lib/mock-monologues';

interface MonologueCardProps {
  monologue: MockMonologue;
  onPress?: () => void;
}

export function MonologueCard({ monologue, onPress }: MonologueCardProps) {
  const metaParts = [
    `${monologue.wordCount} words`,
    monologue.gender === 'any' ? 'any gender' : monologue.gender,
    monologue.ageRange,
    monologue.genre,
  ];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.header}>
        <Text style={styles.character} numberOfLines={1}>
          {monologue.character}
        </Text>
        <Text style={styles.source} numberOfLines={1}>
          {monologue.source}
          {monologue.sourceYear ? ` · ${monologue.sourceYear}` : ''}
        </Text>
      </View>
      <Text style={styles.preview} numberOfLines={3}>
        {monologue.preview}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {metaParts.join(' · ')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardPressed: { opacity: 0.85 },
  header: { marginBottom: 10 },
  character: { fontSize: 17, fontWeight: '600', color: '#111', marginBottom: 2 },
  source: { fontSize: 13, color: '#666' },
  preview: { fontSize: 15, color: '#222', lineHeight: 21, marginBottom: 10 },
  meta: { fontSize: 12, color: '#888', textTransform: 'lowercase' },
});
