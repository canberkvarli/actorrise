import { Text, View } from 'react-native';

interface MatchBadgeProps {
  rank: number; // 0-indexed position in results
  matchType?: string;
}

/**
 * Mirrors web's MatchIndicatorTag — floats centered on the top edge of
 * the card. Strong (brand) styling for top picks + explicit match types,
 * muted for general ranking tiers.
 */
export function MatchBadge({ rank, matchType }: MatchBadgeProps) {
  const label = labelFor(rank, matchType);
  if (!label) return null;
  const isStrong = isStrongLabel(label);

  return (
    <View
      pointerEvents="none"
      className="absolute left-0 right-0 top-0 -translate-y-1/2 z-10 items-center">
      <View
        className={`px-2.5 py-1 border ${
          isStrong
            ? 'bg-brand/15 border-brand/40'
            : 'bg-muted border-border'
        }`}
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
        }}>
        <Text
          className={`text-[11px] font-bold ${
            isStrong ? 'text-brand' : 'text-muted-foreground'
          }`}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function labelFor(rank: number, matchType?: string): string | null {
  if (matchType === 'exact_quote') return 'Exact quote';
  if (matchType === 'fuzzy_quote') return 'This is the one';
  if (matchType === 'title_match') return 'Exact match';
  if (matchType === 'character_match') return 'Character match';
  if (matchType === 'play_match') return 'Play match';
  if (rank <= 1) return 'Best pick';
  if (rank <= 4) return 'Great match';
  if (rank <= 9) return 'Good match';
  return null;
}

function isStrongLabel(label: string): boolean {
  return label !== 'Great match' && label !== 'Good match' && label !== 'Play match';
}
