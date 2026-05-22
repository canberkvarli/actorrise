import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MonologueCard } from '@/components/search/MonologueCard';
import { useAuth } from '@/hooks/use-auth';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { useProfile } from '@/hooks/use-profile';

export default function ProfileScreen() {
  const { user, isLoading: authLoading, signOut } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: bookmarks = [], isLoading: bookmarksLoading } = useBookmarks();

  if (authLoading) {
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

  const hasProfile = !!profile?.name;
  const completionParts = [
    profile?.name,
    profile?.age_range,
    profile?.gender,
    profile?.experience_level,
    profile?.union_status,
    profile?.ethnicity,
    profile?.build,
    profile?.location,
    profile?.training_background,
    (profile?.type ?? []).length > 0 ? 'types' : undefined,
    (profile?.preferred_genres ?? []).length > 0 ? 'genres' : undefined,
  ];
  const completion = Math.round(
    (completionParts.filter(Boolean).length / completionParts.length) * 100,
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <Text className="text-3xl font-bold text-foreground mt-2 mb-6">Profile</Text>

        <View className="bg-card border border-border rounded-2xl px-5 py-5">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Signed in as
          </Text>
          <Text className="text-base font-medium text-foreground" numberOfLines={1}>
            {user?.email ?? 'Anonymous'}
          </Text>
        </View>

        <View className="bg-card border border-border rounded-2xl px-5 py-5 mt-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">
              Actor profile
            </Text>
            {!profileLoading ? (
              <View className="bg-brand/10 px-2 py-0.5">
                <Text className="text-xs font-semibold text-brand">{completion}% complete</Text>
              </View>
            ) : null}
          </View>

          {profileLoading ? (
            <ActivityIndicator color="#CB4B00" />
          ) : hasProfile ? (
            <View className="gap-1.5 mb-4">
              <Text className="text-base font-semibold text-foreground">{profile.name}</Text>
              <Text className="text-sm text-muted-foreground">
                {[profile.age_range, profile.gender, profile.experience_level, profile.union_status]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {profile.location ? (
                <Text className="text-sm text-muted-foreground">{profile.location}</Text>
              ) : null}
            </View>
          ) : (
            <Text className="text-sm text-muted-foreground mb-4 leading-5">
              Set up your profile so AI can tailor recommendations to your age, type, and union
              status. Takes two minutes.
            </Text>
          )}

          <Pressable
            onPress={() => router.push('/profile/edit')}
            className="bg-brand rounded-xl py-3 items-center justify-center active:opacity-80">
            <Text className="text-white font-semibold">
              {hasProfile ? 'Edit profile' : 'Set up profile'}
            </Text>
          </Pressable>
        </View>

        {/* Saved monologues — was the Library tab */}
        <View className="mt-8 mb-3 flex-row items-center justify-between">
          <Text className="text-xl font-bold text-foreground">Saved monologues</Text>
          {bookmarks.length > 0 ? (
            <Text className="text-xs text-muted-foreground">{bookmarks.length} saved</Text>
          ) : null}
        </View>

        {bookmarksLoading ? (
          <ActivityIndicator color="#CB4B00" />
        ) : bookmarks.length === 0 ? (
          <View className="bg-card border border-border rounded-2xl px-5 py-6 items-center">
            <Text className="text-sm text-muted-foreground text-center mb-4">
              Tap the ♥ on any monologue to save it for later.
            </Text>
            <Pressable
              onPress={() => router.push('/(tabs)')}
              className="bg-brand rounded-xl px-5 py-3 active:opacity-80">
              <Text className="text-white font-semibold">Browse monologues</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            {bookmarks.map((m, idx) => (
              <MonologueCard key={m.id} monologue={m} rank={idx} />
            ))}
          </View>
        )}

        {/* Settings rows */}
        <View className="bg-card border border-border rounded-2xl mt-6 overflow-hidden">
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
