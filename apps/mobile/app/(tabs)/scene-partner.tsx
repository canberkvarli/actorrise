import type { UserScript } from '@actorrise/types';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useScripts } from '@/hooks/use-scripts';

export default function ScenePartnerScreen() {
  const { data: scripts = [], isLoading, refetch, isRefetching, error } = useScripts();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 pt-2 pb-2">
        <Text className="text-3xl font-bold text-foreground mb-1">ScenePartner</Text>
        <Text className="text-sm text-muted-foreground">
          Pick a scene. AI reads every line that isn’t yours.
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#CB4B00" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-base font-semibold text-foreground mb-1">
            Could not load scripts
          </Text>
          <Text className="text-sm text-muted-foreground text-center">
            {error instanceof Error ? error.message : 'Try again in a moment.'}
          </Text>
        </View>
      ) : scripts.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={scripts}
          keyExtractor={(s) => String(s.id)}
          renderItem={({ item }) => <ScriptRow script={item} />}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#CB4B00" />
          }
          ListHeaderComponent={
            <Text className="text-xs text-muted-foreground mb-3">
              {scripts.length} {scripts.length === 1 ? 'script' : 'scripts'}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

function ScriptRow({ script }: { script: UserScript }) {
  const isReady = script.processing_status === 'completed' && script.ai_extraction_completed;
  const subtitle = isReady
    ? `${script.num_scenes_extracted} ${script.num_scenes_extracted === 1 ? 'scene' : 'scenes'} · ${script.num_characters} ${script.num_characters === 1 ? 'character' : 'characters'}`
    : statusCopy(script.processing_status);

  return (
    <Pressable
      onPress={() => router.push(`/scripts/${script.id}`)}
      disabled={!isReady}
      className={`bg-card border border-border rounded-2xl px-5 py-4 mb-3 ${
        isReady ? 'active:opacity-80' : 'opacity-60'
      }`}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
            {script.title}
          </Text>
          {script.author ? (
            <Text className="text-xs text-muted-foreground mt-0.5" numberOfLines={1}>
              {script.author}
            </Text>
          ) : null}
          <Text className="text-xs text-muted-foreground mt-2" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        {isReady ? (
          <Text className="text-muted-foreground text-base mt-0.5">›</Text>
        ) : (
          <View className="bg-muted px-2 py-1">
            <Text className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              {script.processing_status}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function EmptyState() {
  return (
    <View className="flex-1 items-center justify-center px-8 -mt-12">
      <Text className="text-xl font-semibold text-foreground mb-2">No scripts yet</Text>
      <Text className="text-sm text-muted-foreground text-center mb-6 leading-5">
        Upload a script on the web to start rehearsing here. Scene extraction takes about a minute
        per script.
      </Text>
      <Pressable
        onPress={() => Linking.openURL('https://actorrise.com/my-scripts')}
        className="bg-brand rounded-xl px-5 py-3 active:opacity-80">
        <Text className="text-white font-semibold">Upload on web</Text>
      </Pressable>
    </View>
  );
}

function statusCopy(status: UserScript['processing_status']): string {
  switch (status) {
    case 'pending':
      return 'Queued for processing…';
    case 'processing':
      return 'Extracting scenes…';
    case 'failed':
      return 'Processing failed';
    default:
      return '';
  }
}
