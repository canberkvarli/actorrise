import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

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

/**
 * Cycles placeholder phrases the way the web's useTypewriterPlaceholder
 * does — gives users an example of natural-language queries instead of
 * forcing them to figure out filters.
 */
export function SearchInput({ value, onChangeText }: SearchInputProps) {
  const [placeholder, setPlaceholder] = useState(TYPEWRITER_PHRASES[0]);

  useEffect(() => {
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % TYPEWRITER_PHRASES.length;
      setPlaceholder(TYPEWRITER_PHRASES[idx]);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <View className="bg-card border border-border rounded-xl px-4 py-3 flex-row items-center">
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
