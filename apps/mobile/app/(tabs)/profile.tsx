import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/use-auth';

export default function ProfileScreen() {
  const { user, isLoading, signOut } = useAuth();

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#CB4B00" />
      </SafeAreaView>
    );
  }

  function confirmSignOut() {
    Alert.alert('Sign out', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <Text className="text-3xl font-bold text-foreground mt-2 mb-6">Profile</Text>

        <View className="bg-card border border-border rounded-xl px-5 py-5 gap-1">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Signed in as</Text>
          <Text className="text-base font-medium text-foreground" numberOfLines={1}>
            {user?.email ?? 'Anonymous'}
          </Text>
        </View>

        <View className="bg-card border border-border rounded-xl mt-4 overflow-hidden">
          <Row label="Subscription" value="Free" />
          <Divider />
          <Row label="Account" value="Manage on web" />
          <Divider />
          <Row label="Privacy" value="actorrise.com/privacy" />
        </View>

        <Pressable
          onPress={confirmSignOut}
          className="mt-6 border border-border rounded-xl py-3.5 items-center justify-center active:opacity-70">
          <Text className="text-foreground font-medium">Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between px-5 py-4">
      <Text className="text-base text-foreground">{label}</Text>
      <Text className="text-sm text-muted-foreground">{value}</Text>
    </View>
  );
}

function Divider() {
  return <View className="h-px bg-border mx-5" />;
}
