import { Text, View } from 'react-native';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
}

export function BrandLogo({ size = 'md' }: BrandLogoProps) {
  const dim = size === 'sm' ? 'h-10 w-10' : size === 'lg' ? 'h-16 w-16' : 'h-12 w-12';
  const textSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-2xl';
  return (
    <View className={`${dim} bg-brand rounded-xl items-center justify-center`}>
      <Text className={`${textSize} font-bold text-white`}>A</Text>
    </View>
  );
}
