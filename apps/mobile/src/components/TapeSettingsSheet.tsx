import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, FadeOutDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useIsFounder } from '../lib/founder';
import { EMPTY_SLATE, type TapeSettings } from '../lib/tapeSettings';
import { colors } from '../theme/tokens';

/**
 * The tape room's settings sheet, and the pieces its sheets are made of.
 * Used by the room over the camera and by the Tape page before it, so the
 * countdown, the cue words and the slate can be set before the camera is on.
 */

const WHITE = '#fffaf3';
const DIM = 'rgba(255,250,243,0.6)';
const GLOW = colors.stageGlow;
const EASE = Easing.out(Easing.cubic);
const SANS = 'BricolageGrotesque_600SemiBold';
const SANS_M = 'BricolageGrotesque_500Medium';
const SERIF = 'InstrumentSerif_400Regular';

/** A sheet up from the bottom over the camera, with a title and a way out. */
export function Sheet({ title, onClose, children, tall }: { title: string; onClose: () => void; children: React.ReactNode; tall?: boolean }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,5,4,0.55)' }}>
        <Pressable onPress={onClose} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding" pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' }}>
      <Animated.View
        entering={FadeInDown.duration(320).easing(EASE)}
        exiting={FadeOutDown.duration(200)}
        style={{ height: tall ? height * 0.82 : undefined, maxHeight: height * 0.82, backgroundColor: colors.ink, borderTopWidth: 1, borderColor: 'rgba(255,250,243,0.12)', paddingBottom: insets.bottom }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 8 }}>
          <Text style={{ fontFamily: SERIF, fontSize: 26, color: WHITE }}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close"
            style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,250,243,0.1)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Ionicons name="close" size={17} color={WHITE} />
          </Pressable>
        </View>
        {children}
      </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

export function SheetLabel({ children }: { children: string }) {
  return (
    <Text style={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 6, fontFamily: 'CourierPrime_700Bold', fontSize: 10, letterSpacing: 2.2, textTransform: 'uppercase', color: DIM }}>
      {children}
    </Text>
  );
}

export function Filter({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ height: 32, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? WHITE : 'rgba(255,250,243,0.1)', justifyContent: 'center' }}>
      <Text style={{ fontFamily: SANS, fontSize: 13, color: on ? colors.ink : WHITE }}>{label}</Text>
    </Pressable>
  );
}

function Row({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 8, gap: 14 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: SANS, fontSize: 15, color: WHITE }}>{label}</Text>
        <Text style={{ fontFamily: SANS_M, fontSize: 12, color: DIM, marginTop: 2 }}>{sub}</Text>
      </View>
      {children}
    </View>
  );
}

function Toggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  const x = useSharedValue(on ? 1 : 0);
  useEffect(() => { x.value = withTiming(on ? 1 : 0, { duration: 180, easing: EASE }); }, [on, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: 3 + x.value * 20 }] }));
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} accessibilityRole="switch" accessibilityState={{ checked: on }} hitSlop={8}
      style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: on ? GLOW : 'rgba(255,250,243,0.18)', justifyContent: 'center' }}>
      <Animated.View style={[knob, { width: 24, height: 24, borderRadius: 12, backgroundColor: WHITE }]} />
    </Pressable>
  );
}

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <View style={{ paddingHorizontal: 22, paddingVertical: 6 }}>
      <Text style={{ fontFamily: SANS_M, fontSize: 12, color: DIM, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,250,243,0.3)"
        autoCorrect={false}
        style={{ height: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(255,250,243,0.08)', color: WHITE, fontFamily: SANS_M, fontSize: 16 }}
      />
    </View>
  );
}

/**
 * The room's settings: the flash, the countdown, the words that roll and
 * cut, the lines under the lens, and your slate, typed once and kept on the phone.
 */
export function TapeSettingsSheet({ settings, onChange, onClose, onSlate, onCameraCheck }: {
  settings: TapeSettings;
  onChange: (s: TapeSettings) => void;
  onClose: () => void;
  /** Tape the slate now. */
  onSlate: () => void;
  /** The founder's camera test bench. */
  onCameraCheck?: () => void;
}) {
  const founder = useIsFounder();
  const [slate, setSlate] = useState(settings.slate);
  const keep = (next: typeof slate) => { setSlate(next); onChange({ ...settings, slate: next }); };
  const slateTyped = Boolean(slate.name || slate.height || slate.location || slate.rep);
  const field = (key: keyof typeof slate, label: string, placeholder: string) => (
    <Field label={label} value={slate[key]} placeholder={placeholder} onChange={(v) => keep({ ...slate, [key]: v })} />
  );
  return (
    <Sheet title="Tape settings" onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 18 }}>
        {/* Temporary: the black-picture test bench. Only on the founder's account. */}
        {founder && onCameraCheck ? <Pressable onPress={onCameraCheck} accessibilityRole="button"
          style={{ marginHorizontal: 22, marginTop: 4, marginBottom: 6, height: 46, borderRadius: 23, backgroundColor: 'rgba(194,78,16,0.9)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: SANS_M, fontSize: 15, color: WHITE }}>Camera check</Text>
        </Pressable> : null}

        <SheetLabel>Countdown when you tap</SheetLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 22, paddingVertical: 6 }}>
          {([0, 3, 5, 10] as const).map((n) => (
            <Filter key={n} label={n === 0 ? 'Off' : `${n} seconds`} on={settings.countdown === n} onPress={() => onChange({ ...settings, countdown: n })} />
          ))}
        </View>
        <SheetLabel>After you say the word</SheetLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 22, paddingVertical: 6 }}>
          {([0, 2, 3] as const).map((b) => (
            <Filter key={b} label={b === 0 ? 'Roll at once' : `${b} second beat`} on={settings.beat === b} onPress={() => onChange({ ...settings, beat: b })} />
          ))}
        </View>

        <SheetLabel>Your words</SheetLabel>
        <Text style={{ paddingHorizontal: 22, paddingBottom: 2, fontFamily: SANS_M, fontSize: 12, color: DIM }}>
          One or two words, said on their own. Leave it empty for “action” and “cut”.
        </Text>
        <Field label="To roll" value={settings.actionWord} placeholder="action" onChange={(v) => onChange({ ...settings, actionWord: v })} />
        <Field label="To stop" value={settings.cutWord} placeholder="cut" onChange={(v) => onChange({ ...settings, cutWord: v })} />

        <SheetLabel>Your lines</SheetLabel>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 22, paddingVertical: 6 }}>
          {(['S', 'M', 'L'] as const).map((z) => (
            <Filter key={z} label={z === 'S' ? 'Small' : z === 'M' ? 'Medium' : 'Large'} on={settings.prompterSize === z} onPress={() => onChange({ ...settings, prompterSize: z })} />
          ))}
        </View>
        <Row label="A dark band behind the lines" sub="So they read on a bright wall or a white shirt.">
          <Toggle on={settings.prompterBacking} onPress={() => onChange({ ...settings, prompterBacking: !settings.prompterBacking })} />
        </Row>

        <SheetLabel>Signal</SheetLabel>
        <Row label="A flash when it rolls and cuts" sub="The torch on the back camera, the screen on the front. You see it heard you from across the room.">
          <Toggle on={settings.tones} onPress={() => onChange({ ...settings, tones: !settings.tones })} />
        </Row>
        <SheetLabel>Picture</SheetLabel>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 22, paddingVertical: 6 }}>
          <Filter label="1080p" on={settings.quality === '1080p'} onPress={() => onChange({ ...settings, quality: '1080p' })} />
          <Filter label="4K, bigger files" on={settings.quality === '2160p'} onPress={() => onChange({ ...settings, quality: '2160p' })} />
        </View>
        <Row label="Steady on the back camera" sub="Smooths a hand held or a wobbly stand.">
          <Toggle on={settings.steady} onPress={() => onChange({ ...settings, steady: !settings.steady })} />
        </Row>
        <Row label="Slate first when I save or send" sub="Your newest slate and the take, as one file named the casting way.">
          <Toggle on={settings.slateFirst} onPress={() => onChange({ ...settings, slateFirst: !settings.slateFirst })} />
        </Row>
        <SheetLabel>After you stop</SheetLabel>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 22, paddingVertical: 6 }}>
          <Filter label="Save to Tapes" on={settings.afterCut === 'tapes'} onPress={() => onChange({ ...settings, afterCut: 'tapes' })} />
          <Filter label="Play it back" on={settings.afterCut === 'play'} onPress={() => onChange({ ...settings, afterCut: 'play' })} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 22 }}>
          <SheetLabel>Your slate</SheetLabel>
          {slateTyped ? (
            <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); keep(EMPTY_SLATE); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear the slate"
              style={({ pressed }) => ({ marginTop: 10, height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(255,250,243,0.1)', flexDirection: 'row', alignItems: 'center', gap: 5, opacity: pressed ? 0.7 : 1 })}>
              <Ionicons name="close-circle-outline" size={14} color={WHITE} />
              <Text style={{ fontFamily: SANS, fontSize: 12.5, color: WHITE }}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
        {field('name', 'Name', 'Your name')}
        {field('height', 'Height', 'Like 5’10”')}
        {field('location', 'Based in', 'Your town')}
        {field('rep', 'Agent or manager (if any)', 'Leave it empty if none')}
        <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
          <Pressable
            onPress={onSlate}
            disabled={!slate.name.trim()}
            accessibilityRole="button"
            style={({ pressed }) => ({ height: 52, borderRadius: 999, backgroundColor: slate.name.trim() ? GLOW : 'rgba(255,250,243,0.12)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: pressed ? 0.85 : 1 })}
          >
            <Ionicons name="person-circle-outline" size={19} color={slate.name.trim() ? colors.ink : DIM} />
            <Text style={{ fontFamily: SANS, fontSize: 15, color: slate.name.trim() ? colors.ink : DIM }}>Tape my slate</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Sheet>
  );
}
