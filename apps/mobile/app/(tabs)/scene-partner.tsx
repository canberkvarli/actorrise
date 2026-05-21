import * as Linking from 'expo-linking';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const FEATURES = [
  {
    title: 'AI reads your partner',
    body: 'Upload a scene on the web, and ScenePartner reads every line that isn’t yours, with stage directions baked into the delivery.',
  },
  {
    title: 'Rehearse anywhere',
    body: 'Lock the phone. Put it in your pocket. Audio keeps playing, lock-screen controls let you pause between takes.',
  },
  {
    title: 'Record your reads',
    body: 'Capture your own lines as you go. Play it back side-by-side with the AI partner — see what to tighten before the room.',
  },
];

export default function ScenePartnerScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <Text className="text-3xl font-bold text-foreground mt-2 mb-2">ScenePartner</Text>
        <Text className="text-base text-muted-foreground mb-6 leading-6">
          Run lines with an AI partner that reads every other character. Same tool you use on the
          web, on your phone in the rehearsal room.
        </Text>

        <View className="bg-brand/5 border border-brand/20 rounded-2xl px-5 py-5 mb-8">
          <Text className="text-xs font-semibold text-brand uppercase tracking-widest mb-2">
            Coming next
          </Text>
          <Text className="text-base font-semibold text-foreground mb-1.5">
            Mobile rehearsal lands in v1.1
          </Text>
          <Text className="text-sm text-muted-foreground leading-5 mb-4">
            Native audio with background playback and lock-screen controls is in active build. For
            now, upload your scenes on the web and they’ll be ready here when v1.1 ships.
          </Text>
          <Pressable
            onPress={() => Linking.openURL('https://actorrise.com/my-scripts')}
            className="bg-brand rounded-xl py-3 items-center justify-center active:opacity-80">
            <Text className="text-white font-semibold">Upload a script on web</Text>
          </Pressable>
        </View>

        <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          What it does
        </Text>
        {FEATURES.map((f) => (
          <View key={f.title} className="bg-card border border-border rounded-xl px-5 py-4 mb-3">
            <Text className="text-base font-semibold text-foreground mb-1">{f.title}</Text>
            <Text className="text-sm text-muted-foreground leading-5">{f.body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
