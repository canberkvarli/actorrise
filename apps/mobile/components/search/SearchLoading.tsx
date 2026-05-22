import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

const STEPS = [
  'Consulting drama gods',
  'Asking Shakespeare',
  'Rifling through the script pile',
  'Finding ones that’ll stop the room',
];

export function SearchLoading() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s + 1) % STEPS.length);
    }, 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <View className="flex-1 items-center justify-center px-8">
      <ActivityIndicator size="small" color="#CB4B00" />
      <Text className="text-sm text-foreground mt-4 font-medium">{STEPS[step]}…</Text>
      <Text className="text-xs text-muted-foreground mt-1">Powered by AI</Text>
    </View>
  );
}
