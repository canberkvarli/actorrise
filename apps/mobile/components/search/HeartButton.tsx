import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useToggleFavorite } from '@/hooks/use-bookmarks';

interface HeartButtonProps {
  monologueId: number;
  isFavorited: boolean;
}

export function HeartButton({ monologueId, isFavorited }: HeartButtonProps) {
  const toggle = useToggleFavorite();
  const scale = useSharedValue(1);
  const color = useSharedValue(isFavorited ? 1 : 0);

  useEffect(() => {
    color.value = withTiming(isFavorited ? 1 : 0, { duration: 200 });
  }, [isFavorited, color]);

  const onPress = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    // Spring pulse on tap — bigger when adding, gentler when removing.
    if (!isFavorited) {
      scale.value = withSequence(
        withSpring(1.4, { damping: 6, stiffness: 250 }),
        withSpring(1, { damping: 8, stiffness: 180 }),
      );
    } else {
      scale.value = withSequence(
        withSpring(0.85, { damping: 8, stiffness: 250 }),
        withSpring(1, { damping: 10, stiffness: 200 }),
      );
    }
    toggle.mutate({ monologueId, nextState: !isFavorited });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      hitSlop={10}
      onPress={onPress}
      className={`w-11 h-11 items-center justify-center rounded-lg ${
        isFavorited ? 'bg-brand/10' : ''
      } active:opacity-60`}>
      <Animated.View style={animatedStyle}>
        <Text
          className={`text-2xl ${
            isFavorited ? 'text-brand' : 'text-muted-foreground'
          }`}
          style={{ lineHeight: 28 }}>
          {isFavorited ? '♥' : '♡'}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
