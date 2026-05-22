import type { Scene } from '@actorrise/types';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDeliverLine, useStartRehearsal } from '@/hooks/use-rehearsal-session';
import { useScene } from '@/hooks/use-scripts';
import { synthesizeSpeech } from '@/lib/tts';

type Mode = 'choose-character' | 'session' | 'done';

export default function RehearseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sceneIdNum = Number(id);
  const { data: scene, isLoading, error } = useScene(id);

  const [mode, setMode] = useState<Mode>('choose-character');
  const [userCharacter, setUserCharacter] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [lineIdx, setLineIdx] = useState(0);

  const startSession = useStartRehearsal();
  const deliverLine = useDeliverLine();

  const characters = useMemo(() => scene?.characters ?? [], [scene]);
  const lines = useMemo(() => scene?.lines ?? [], [scene]);
  const currentLine = lines[lineIdx];

  async function pickCharacter(char: string) {
    if (!scene) return;
    setUserCharacter(char);
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        shouldPlayInBackground: true,
      });
      const session = await startSession.mutateAsync({
        scene_id: sceneIdNum,
        user_character: char,
      });
      setSessionId(session.id);
      setMode('session');
      setLineIdx(0);
    } catch (e) {
      Alert.alert(
        'Could not start session',
        e instanceof Error ? e.message : 'Try again in a moment.',
      );
      setUserCharacter(null);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#CB4B00" />
      </SafeAreaView>
    );
  }

  if (error || !scene) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-8">
        <Text className="text-base font-semibold text-foreground mb-1">
          Could not load scene
        </Text>
        <Text className="text-sm text-muted-foreground text-center">
          {error instanceof Error ? error.message : 'This scene may have been removed.'}
        </Text>
      </SafeAreaView>
    );
  }

  if (mode === 'choose-character') {
    return (
      <CharacterPicker
        scene={scene}
        characters={characters}
        starting={startSession.isPending}
        onPick={pickCharacter}
      />
    );
  }

  if (mode === 'done') {
    return <DoneScreen />;
  }

  return (
    <SessionView
      scene={scene}
      lineIdx={lineIdx}
      currentLine={currentLine}
      userCharacter={userCharacter!}
      onAdvance={() => {
        const next = lineIdx + 1;
        if (next >= lines.length) {
          setMode('done');
        } else {
          setLineIdx(next);
        }
      }}
      onDeliverUserLine={async () => {
        if (sessionId && currentLine) {
          try {
            await deliverLine.mutateAsync({
              session_id: sessionId,
              user_input: currentLine.text,
              request_feedback: false,
            });
          } catch {
            // Non-fatal — keep moving through the scene.
          }
        }
      }}
    />
  );
}

function CharacterPicker({
  scene,
  characters,
  starting,
  onPick,
}: {
  scene: Scene;
  characters: string[];
  starting: boolean;
  onPick: (char: string) => void;
}) {
  return (
    <>
      <Stack.Screen options={{ title: scene.title ?? 'Scene' }} />
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16 }}>
          <Text className="text-xs uppercase tracking-widest text-brand font-semibold mb-2">
            ScenePartner
          </Text>
          <Text className="text-2xl font-bold text-foreground mb-2">{scene.title}</Text>
          {scene.description ? (
            <Text className="text-sm text-muted-foreground mb-6 leading-5">
              {scene.description}
            </Text>
          ) : null}

          <Text className="text-base font-semibold text-foreground mb-3">
            Which character are you playing?
          </Text>
          <Text className="text-sm text-muted-foreground mb-5 leading-5">
            We&apos;ll read every other character with AI voice. You read your lines aloud.
          </Text>

          {characters.length === 0 ? (
            <Text className="text-sm text-muted-foreground">
              No characters detected in this scene.
            </Text>
          ) : (
            <View className="gap-2">
              {characters.map((char) => (
                <Pressable
                  key={char}
                  onPress={() => onPick(char)}
                  disabled={starting}
                  className="bg-card border border-border rounded-xl px-5 py-4 flex-row items-center justify-between active:opacity-80">
                  <Text className="text-base font-medium text-foreground">{char}</Text>
                  {starting ? (
                    <ActivityIndicator size="small" color="#CB4B00" />
                  ) : (
                    <Text className="text-muted-foreground">›</Text>
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function SessionView({
  scene,
  lineIdx,
  currentLine,
  userCharacter,
  onAdvance,
  onDeliverUserLine,
}: {
  scene: Scene;
  lineIdx: number;
  currentLine: Scene['lines'][number] | undefined;
  userCharacter: string;
  onAdvance: () => void;
  onDeliverUserLine: () => Promise<void>;
}) {
  const [ttsUri, setTtsUri] = useState<string | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const advancedRef = useRef(false);
  const player = useAudioPlayer(ttsUri ?? undefined);
  const status = useAudioPlayerStatus(player);

  const isUserLine = currentLine?.character === userCharacter;

  useEffect(() => {
    if (!currentLine || isUserLine) {
      setTtsUri(null);
      return;
    }
    setError(null);
    setSynthesizing(true);
    advancedRef.current = false;
    let cancelled = false;
    synthesizeSpeech({
      text: currentLine.text,
      voice: 'coral',
      instructions: currentLine.stage_direction
        ? `Read this line in character. Stage direction: ${currentLine.stage_direction}.`
        : 'Read this line in character.',
    })
      .then((uri) => {
        if (cancelled) return;
        setTtsUri(uri);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setSynthesizing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentLine, isUserLine]);

  useEffect(() => {
    if (ttsUri && player) {
      player.play();
    }
  }, [ttsUri, player]);

  useEffect(() => {
    if (
      !isUserLine &&
      !advancedRef.current &&
      status.didJustFinish
    ) {
      advancedRef.current = true;
      onAdvance();
    }
  }, [status.didJustFinish, isUserLine, onAdvance]);

  const totalLines = scene.lines.length;
  const progress = totalLines > 0 ? (lineIdx + 1) / totalLines : 0;

  if (!currentLine) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <Text className="text-base text-muted-foreground">No lines</Text>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: scene.title ?? 'Rehearsal' }} />
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <View className="px-5 pt-3 pb-2">
          <View className="h-1 bg-border rounded-full overflow-hidden">
            <View
              className="h-1 bg-brand"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </View>
          <Text className="text-xs text-muted-foreground mt-2">
            Line {lineIdx + 1} of {totalLines}
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16 }}>
          <View
            className={`rounded-2xl px-5 py-5 border ${
              isUserLine ? 'bg-brand/5 border-brand/30' : 'bg-card border-border'
            }`}>
            <Text
              className={`text-xs uppercase tracking-widest font-semibold mb-2 ${
                isUserLine ? 'text-brand' : 'text-muted-foreground'
              }`}>
              {isUserLine ? 'Your line' : currentLine.character}
            </Text>
            {currentLine.stage_direction ? (
              <Text className="text-sm italic text-muted-foreground mb-3">
                ({currentLine.stage_direction})
              </Text>
            ) : null}
            <Text className="text-lg text-foreground leading-7">{currentLine.text}</Text>
          </View>

          {!isUserLine && synthesizing ? (
            <View className="flex-row items-center mt-4 gap-2">
              <ActivityIndicator size="small" color="#CB4B00" />
              <Text className="text-sm text-muted-foreground">Generating audio…</Text>
            </View>
          ) : null}

          {!isUserLine && status.playing ? (
            <View className="flex-row items-center mt-4 gap-2">
              <View className="w-2 h-2 rounded-full bg-brand" />
              <Text className="text-sm text-foreground">Partner is reading…</Text>
            </View>
          ) : null}

          {error ? (
            <Text className="text-sm text-red-600 mt-4">{error}</Text>
          ) : null}
        </ScrollView>

        <View className="px-5 py-3 border-t border-border flex-row gap-3">
          <Pressable
            onPress={() => router.back()}
            className="px-5 border border-border rounded-xl py-3.5 items-center justify-center active:opacity-70">
            <Text className="text-foreground font-medium">Exit</Text>
          </Pressable>
          {isUserLine ? (
            <Pressable
              onPress={async () => {
                await onDeliverUserLine();
                onAdvance();
              }}
              className="flex-1 bg-brand rounded-xl py-3.5 items-center justify-center active:opacity-80">
              <Text className="text-white font-semibold text-base">Done with my line</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={onAdvance}
              className="flex-1 bg-card border border-border rounded-xl py-3.5 items-center justify-center active:opacity-70">
              <Text className="text-foreground font-medium">Skip</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </>
  );
}

function DoneScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Done', headerBackVisible: false }} />
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-8">
        <Text className="text-6xl mb-4">🎭</Text>
        <Text className="text-2xl font-bold text-foreground mb-2">Scene complete</Text>
        <Text className="text-sm text-muted-foreground text-center mb-8">
          Run it again for a tighter take, or pick another scene to keep going.
        </Text>
        <Pressable
          onPress={() => router.dismissAll()}
          className="bg-brand rounded-xl px-6 py-3 active:opacity-80">
          <Text className="text-white font-semibold">Back to scripts</Text>
        </Pressable>
      </SafeAreaView>
    </>
  );
}
