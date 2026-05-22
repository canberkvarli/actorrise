import { Text, View } from 'react-native';

import { colorsFor } from '@/lib/emotion-colors';

interface EmotionBadgeProps {
  emotion?: string;
}

export function EmotionBadge({ emotion }: EmotionBadgeProps) {
  if (!emotion) return null;
  const { bg, text } = colorsFor(emotion);
  return (
    <View style={{ backgroundColor: bg }} className="self-start px-2.5 py-1">
      <Text style={{ color: text }} className="text-[11px] font-semibold uppercase tracking-wider">
        {emotion}
      </Text>
    </View>
  );
}
