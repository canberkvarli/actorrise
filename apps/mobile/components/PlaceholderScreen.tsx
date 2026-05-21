import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface PlaceholderScreenProps {
  title: string;
  subtitle?: string;
}

export function PlaceholderScreen({ title, subtitle }: PlaceholderScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-3xl font-bold text-foreground mb-2">{title}</Text>
        {subtitle ? (
          <Text className="text-sm text-muted-foreground text-center">{subtitle}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
