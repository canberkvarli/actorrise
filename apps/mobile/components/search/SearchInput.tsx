import { useEffect, useState } from 'react';
import { TextInput, View, Text } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const TYPEWRITER_PHRASES = [
  'A dramatic monologue for a woman in her 30s, Chekhov',
  'Comedic, under 90 seconds, male in his 20s',
  'Shakespearean villain, classical training',
  'Modern, female, anger',
  'Fresh material, contemporary, female 40s',
];

interface SearchInputProps {
  value: string;
  onChangeText: (next: string) => void;
}

export function SearchInput({ value, onChangeText }: SearchInputProps) {
  const [placeholder, setPlaceholder] = useState(TYPEWRITER_PHRASES[0]);
  const sparkleScale = useSharedValue(1);
  const sparkleRotation = useSharedValue(0);

  useEffect(() => {
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % TYPEWRITER_PHRASES.length;
      setPlaceholder(TYPEWRITER_PHRASES[idx]);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Gentle continuous breathing — never stops, never aggressive.
    sparkleScale.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    sparkleRotation.value = withRepeat(
      withSequence(
        withTiming(8, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
        withTiming(-8, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [sparkleScale, sparkleRotation]);

  const sparkleStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: sparkleScale.value },
      { rotate: `${sparkleRotation.value}deg` },
    ],
  }));

  return (
    <View className="bg-card border border-border rounded-xl pl-3 pr-3 py-3 flex-row items-center gap-2.5">
      <View className="w-7 h-7 items-center justify-center bg-brand/10 rounded-md">
        <Animated.View style={sparkleStyle}>
          <Text className="text-brand text-base">✦</Text>
        </Animated.View>
      </View>
      <TextInput
        className="flex-1 text-base text-foreground"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#A1A1AA"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
      />
    </View>
  );
}
