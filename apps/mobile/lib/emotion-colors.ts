/**
 * Mirror of apps/web/lib/emotionColors.ts hues. Hand-picked muted tones
 * that match the web's emotion badge palette so a "joy" monologue looks
 * the same color in both platforms.
 */
export const EMOTION_COLORS: Record<string, { bg: string; text: string }> = {
  joy: { bg: '#FEF3C7', text: '#92400E' },
  sadness: { bg: '#DBEAFE', text: '#1E40AF' },
  anger: { bg: '#FEE2E2', text: '#991B1B' },
  fear: { bg: '#EDE9FE', text: '#5B21B6' },
  melancholy: { bg: '#E0E7FF', text: '#3730A3' },
  hope: { bg: '#D1FAE5', text: '#065F46' },
  love: { bg: '#FCE7F3', text: '#9D174D' },
  contemplative: { bg: '#E5E7EB', text: '#374151' },
  philosophical: { bg: '#F3E8FF', text: '#6B21A8' },
  comedic: { bg: '#FFEDD5', text: '#9A3412' },
  dramatic: { bg: '#FEE2E2', text: '#991B1B' },
};

export function colorsFor(emotion?: string): { bg: string; text: string } {
  if (!emotion) return { bg: '#E5E7EB', text: '#374151' };
  return EMOTION_COLORS[emotion.toLowerCase()] ?? { bg: '#E5E7EB', text: '#374151' };
}
