import { Text, View } from 'react-native';

interface MatchBadgeProps {
  rank: number; // 0-indexed position in results
  matchType?: string;
}

/**
 * Mirrors the web's match indicator labels. Top-3 ranks get "Best pick",
 * "Great match", "Good match"; explicit match_type values (exact_quote,
 * character_match) take precedence when present.
 */
export function MatchBadge({ rank, matchType }: MatchBadgeProps) {
  const { label, tone } = labelFor(rank, matchType);
  if (!label) return null;

  const toneStyles: Record<typeof tone, string> = {
    primary: 'bg-brand/10 text-brand',
    neutral: 'bg-muted text-muted-foreground',
  };

  return (
    <View className={`self-start px-2 py-1 ${toneStyles[tone].split(' ')[0]}`}>
      <Text className={`text-[11px] font-medium uppercase tracking-wide ${toneStyles[tone].split(' ')[1]}`}>
        {label}
      </Text>
    </View>
  );
}

function labelFor(
  rank: number,
  matchType?: string,
): { label: string | null; tone: 'primary' | 'neutral' } {
  if (matchType === 'exact_quote') return { label: 'Exact quote', tone: 'primary' };
  if (matchType === 'fuzzy_quote') return { label: 'This is the one', tone: 'primary' };
  if (matchType === 'character_match') return { label: 'Character match', tone: 'primary' };
  if (matchType === 'play_match') return { label: 'Play match', tone: 'neutral' };
  if (matchType === 'title_match') return { label: 'Title match', tone: 'neutral' };

  if (rank === 0) return { label: 'Best pick', tone: 'primary' };
  if (rank === 1) return { label: 'Great match', tone: 'primary' };
  if (rank === 2) return { label: 'Good match', tone: 'neutral' };
  return { label: null, tone: 'neutral' };
}
