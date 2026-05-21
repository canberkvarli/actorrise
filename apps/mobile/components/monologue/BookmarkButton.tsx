import { ActivityIndicator, Pressable, Text } from 'react-native';

import { useToggleFavorite } from '@/hooks/use-bookmarks';

interface BookmarkButtonProps {
  monologueId: number;
  isFavorited: boolean;
}

export function BookmarkButton({ monologueId, isFavorited }: BookmarkButtonProps) {
  const toggle = useToggleFavorite();

  return (
    <Pressable
      onPress={() => toggle.mutate({ monologueId, nextState: !isFavorited })}
      disabled={toggle.isPending}
      className={`px-4 py-2.5 rounded-xl border active:opacity-70 ${
        isFavorited
          ? 'bg-brand border-brand'
          : 'bg-card border-border'
      }`}>
      {toggle.isPending ? (
        <ActivityIndicator color={isFavorited ? '#FFFFFF' : '#CB4B00'} />
      ) : (
        <Text className={`text-sm font-medium ${isFavorited ? 'text-white' : 'text-foreground'}`}>
          {isFavorited ? 'Saved' : 'Save'}
        </Text>
      )}
    </Pressable>
  );
}
