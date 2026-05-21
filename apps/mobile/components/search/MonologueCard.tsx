import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { Monologue } from '@actorrise/types';

import { MatchBadge } from './MatchBadge';

interface MonologueCardProps {
  monologue: Monologue;
  rank: number;
  onPress?: () => void;
}

export function MonologueCard({ monologue, rank, onPress }: MonologueCardProps) {
  const handlePress = onPress ?? (() => router.push(`/monologue/${monologue.id}`));
  const meta = [
    `${monologue.word_count} words`,
    formatDuration(monologue.estimated_duration_seconds),
    monologue.character_gender || monologue.gender,
    monologue.character_age_range || monologue.age_range,
    monologue.tone,
  ].filter(Boolean);

  const preview =
    monologue.excerpt ??
    monologue.scene_description ??
    monologue.text.slice(0, 240);

  return (
    <Pressable
      onPress={handlePress}
      className="bg-card border border-border rounded-xl px-5 py-4 mb-3 active:opacity-80">
      <MatchBadge rank={rank} matchType={monologue.match_type} />

      <Text className="text-lg font-semibold text-foreground mt-2" numberOfLines={1}>
        {monologue.character_name}
      </Text>
      <Text className="text-sm text-muted-foreground" numberOfLines={1}>
        {monologue.play_title}
        {monologue.author ? ` · ${monologue.author}` : ''}
      </Text>

      <Text className="text-[15px] text-foreground/80 leading-[22px] mt-3" numberOfLines={3}>
        {preview}
      </Text>

      <Text className="text-xs text-muted-foreground/80 mt-3" numberOfLines={1}>
        {meta.join(' · ')}
      </Text>
    </Pressable>
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
