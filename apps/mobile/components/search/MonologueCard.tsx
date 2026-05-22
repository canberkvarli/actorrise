import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
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

  const isClassical = monologue.category?.toLowerCase() === 'classical';
  const showGender =
    monologue.character_gender &&
    monologue.character_gender.toLowerCase() !== 'any';
  const showAge =
    monologue.character_age_range &&
    monologue.character_age_range.toLowerCase() !== 'any';

  const meaningfulTitle =
    monologue.title &&
    monologue.title.toLowerCase() !== monologue.character_name?.toLowerCase() &&
    monologue.title.toLowerCase() !== monologue.play_title?.toLowerCase() &&
    monologue.title.length > 2;

  const preview = `“${monologue.text.slice(0, 200).trim()}…”`;

  return (
    <Animated.View
      entering={FadeInDown.duration(280).delay(Math.min(rank * 40, 200))}
      className="relative pt-2.5">
      <MatchBadge rank={rank} matchType={monologue.match_type} />
      <Pressable
        onPress={handlePress}
        className="bg-card border border-border rounded-2xl px-5 pt-5 pb-4 mb-3 active:opacity-90">
        {/* Top row: poster + title block + bookmark */}
        <View className="flex-row gap-3 items-start">
          {monologue.poster_url ? (
            <View className="w-14 h-20 rounded-md overflow-hidden bg-muted shrink-0">
              <Image
                source={{ uri: monologue.poster_url }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={120}
              />
            </View>
          ) : null}

          <View className="flex-1 min-w-0">
            <View className="flex-row items-center gap-2 flex-wrap mb-0.5">
              <Text
                className="text-xl font-bold text-foreground flex-shrink"
                numberOfLines={2}>
                {monologue.character_name}
              </Text>
              {monologue.is_favorited ? (
                <View className="bg-muted border border-border px-2 py-0.5">
                  <Text className="text-[10px] font-semibold text-foreground">Saved</Text>
                </View>
              ) : null}
            </View>
            {meaningfulTitle ? (
              <Text
                className="text-sm font-medium text-foreground/90 mb-0.5"
                numberOfLines={1}>
                {monologue.title}
              </Text>
            ) : null}
            <Text className="text-sm text-muted-foreground" numberOfLines={1}>
              {monologue.play_title}
            </Text>
            {monologue.author ? (
              <Text className="text-xs text-muted-foreground/80">
                by {monologue.author}
              </Text>
            ) : null}
          </View>

          <Pressable
            hitSlop={8}
            onPress={(e) => {
              e.stopPropagation?.();
              toggleFav.mutate({
                monologueId: monologue.id,
                nextState: !monologue.is_favorited,
              });
            }}
            className={`w-11 h-11 items-center justify-center rounded-lg ${
              monologue.is_favorited ? 'bg-brand/10' : ''
            } active:opacity-60`}>
            <Text
              className={`text-xl ${
                monologue.is_favorited ? 'text-brand' : 'text-muted-foreground'
              }`}>
              {monologue.is_favorited ? '♥' : '♡'}
            </Text>
          </Pressable>
        </View>

        {/* Metadata row */}
        {(showGender || showAge || monologue.category) ? (
          <View className="flex-row items-center gap-2 flex-wrap mt-3.5">
            {showGender ? (
              <Text className="text-[11px] text-muted-foreground capitalize">
                {monologue.character_gender}
              </Text>
            ) : null}
            {showGender && showAge ? (
              <Text className="text-muted-foreground/40 text-[11px]">·</Text>
            ) : null}
            {showAge ? (
              <Text className="text-[11px] text-muted-foreground">
                {monologue.character_age_range}
              </Text>
            ) : null}
            {monologue.category ? (
              <View
                className={`border px-2 py-0.5 ${
                  isClassical
                    ? 'border-amber-500/50 bg-amber-50'
                    : 'border-sky-500/50 bg-sky-50'
                }`}>
                <Text
                  className={`text-[10px] font-medium capitalize ${
                    isClassical ? 'text-amber-700' : 'text-sky-700'
                  }`}>
                  {monologue.category}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Emotion on its own line */}
        {monologue.primary_emotion &&
        monologue.primary_emotion.toLowerCase() !== 'unknown' ? (
          <View className="mt-2.5">
            <EmotionBadge emotion={monologue.primary_emotion} />
          </View>
        ) : null}

        {/* Synopsis quote */}
        <Text
          className="text-sm text-muted-foreground leading-[20px] mt-3"
          numberOfLines={3}>
          {preview}
        </Text>

        {/* Footer row */}
        <View className="flex-row items-center justify-between mt-4 pt-3.5 border-t border-border">
          <Text className="text-xs font-medium text-muted-foreground">
            {formatDuration(monologue.estimated_duration_seconds)}
          </Text>
          <Text className="text-xs text-muted-foreground">{monologue.word_count} words</Text>
          <View className="flex-row items-center gap-1">
            <Text className="text-xs text-muted-foreground">♥</Text>
            <Text className="text-xs text-muted-foreground">{monologue.favorite_count}</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '0:00 min';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')} min`;
}
