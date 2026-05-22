import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { Monologue } from '@actorrise/types';

import { useToggleFavorite } from '@/hooks/use-bookmarks';

import { EmotionBadge } from './EmotionBadge';
import { MatchBadge } from './MatchBadge';

interface MonologueCardProps {
  monologue: Monologue;
  rank: number;
  onPress?: () => void;
}

export function MonologueCard({ monologue, rank, onPress }: MonologueCardProps) {
  const toggleFav = useToggleFavorite();
  const handlePress = onPress ?? (() => router.push(`/monologue/${monologue.id}`));

  const meta = [
    `${monologue.word_count} words`,
    formatDuration(monologue.estimated_duration_seconds),
    monologue.character_gender || monologue.gender,
    monologue.character_age_range || monologue.age_range,
  ].filter(Boolean) as string[];

  const preview =
    monologue.excerpt ??
    monologue.scene_description ??
    monologue.text.slice(0, 220);

  const hasPoster = !!monologue.poster_url;

  return (
    <Pressable
      onPress={handlePress}
      className="bg-card border border-border rounded-2xl mb-3 overflow-hidden active:opacity-90">
      <View className="flex-row">
        {/* Poster column */}
        <View className="w-[84px] bg-muted">
          {hasPoster ? (
            <Image
              source={{ uri: monologue.poster_url ?? undefined }}
              style={{ width: 84, height: 124 }}
              contentFit="cover"
              transition={120}
            />
          ) : (
            <View className="w-[84px] h-[124px] items-center justify-center px-2">
              <Text className="text-[10px] uppercase tracking-widest text-muted-foreground text-center">
                {monologue.source_type === 'film' || monologue.source_type === 'tv'
                  ? monologue.source_type
                  : 'play'}
              </Text>
            </View>
          )}
        </View>

        {/* Content column */}
        <View className="flex-1 pl-3.5 pr-3 py-3">
          <View className="flex-row items-center gap-2 mb-1.5">
            <MatchBadge rank={rank} matchType={monologue.match_type} />
            {monologue.primary_emotion ? (
              <EmotionBadge emotion={monologue.primary_emotion} />
            ) : null}
          </View>

          <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
            {monologue.character_name}
          </Text>
          <Text className="text-xs text-muted-foreground mb-1.5" numberOfLines={1}>
            {monologue.play_title}
            {monologue.author ? ` · ${monologue.author}` : ''}
          </Text>

          <Text className="text-[13px] text-foreground/80 leading-[19px]" numberOfLines={3}>
            {preview}
          </Text>

          <Text className="text-[11px] text-muted-foreground/80 mt-2" numberOfLines={1}>
            {meta.join(' · ')}
          </Text>
        </View>

        {/* Bookmark button overlay */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            toggleFav.mutate({
              monologueId: monologue.id,
              nextState: !monologue.is_favorited,
            });
          }}
          hitSlop={8}
          className="absolute top-2 right-2 w-8 h-8 items-center justify-center rounded-full bg-background/90 active:opacity-60">
          <Text
            className={`text-base ${monologue.is_favorited ? 'text-brand' : 'text-muted-foreground'}`}>
            {monologue.is_favorited ? '★' : '☆'}
          </Text>
        </Pressable>
      </View>
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
