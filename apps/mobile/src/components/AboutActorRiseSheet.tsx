import { Image, Linking, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PrimaryPill } from './PrimaryPill';
import { StageDirection } from './StageDirection';
import { track } from '../lib/analytics';
import { useTheme } from '../theme/ThemeContext';
import { monologueRoomsShown, useL, useLocale } from '../i18n';

const SITE = 'https://ghostlight.actor';

/**
 * "Ghost Light on the web", behind a question rather than on the page. Until
 * 2026-11-16 the site was ActorRise, a second name this sheet had to explain;
 * now it is one product, so it says what the bigger screen adds and that the
 * account is one account. File and event names (app_about_actorrise) stay so
 * the analytics read across the change.
 */
export function AboutActorRiseSheet({
  open,
  onClose,
  from,
}: {
  open: boolean;
  onClose: () => void;
  from: 'auth' | 'account';
}) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const L = useL();
  const rooms = monologueRoomsShown(useLocale());
  const visit = () => {
    track('app_about_actorrise', { from, visited: true });
    void Linking.openURL(SITE);
  };
  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1, backgroundColor: 'rgba(12,7,4,0.72)' }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={L('Close', 'Kapat')} style={{ flex: 1 }} />
        <Animated.View
          entering={FadeIn.duration(260).delay(60)}
          style={{
            backgroundColor: c.panel,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: c.border,
            paddingHorizontal: 22,
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <StageDirection>{L('(on the web.)', '(webde.)')}</StageDirection>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={L('Close', 'Kapat')}>
              <Ionicons name="close" size={22} color={c.mutedForeground} />
            </Pressable>
          </View>

          <Image
            source={c.isLight ? require('../../assets/ghostlight-wordmark-dark.png') : require('../../assets/ghostlight-wordmark-light.png')}
            accessibilityLabel="Ghost Light"
            resizeMode="contain"
            style={{ marginTop: 10, marginLeft: -14, width: 220, height: 66 }}
          />

          <Text
            style={{
              marginTop: 4,
              fontFamily: 'InstrumentSerif_400Regular',
              fontSize: 30,
              lineHeight: 34,
              letterSpacing: -0.4,
              color: c.foreground,
            }}
          >
            {L('The same stage.', 'Aynı sahne.')}{' '}
            <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', color: c.accentText }}>
              {L('On a bigger screen.', 'Daha büyük bir ekranda.')}
            </Text>
          </Text>

          <View style={{ marginTop: 16, gap: 10 }}>
            {/* The Turkish app has no book and no board (src/i18n). */}
            {rooms ? (
              <>
              <Line icon="book-outline" text={L("Every monologue in here, with your cuts, your notes and the pieces you're off book on.", 'Tüm monologlar, kesintilerin, notların ve ezberlediğin parçalarla birlikte.')} />
            <Line icon="calendar-outline" text={L('The audition board, the one the emails fill, with its reminders and the calendar feed.', 'Seçme panosu: e-postaların doldurduğu, hatırlatmaları ve takvim akışıyla.')} />
              </>
            ) : null}
            <Line icon="mic-outline" text={L('A rehearsal room: run a scene with a partner that reads with you, and tape yourself.', 'Bir prova odası: seninle okuyan bir partnerle sahne çalış, kendini kaydet.')} />
          </View>

          <Text
            style={{
              marginTop: 16,
              fontFamily: 'CourierPrime_400Regular_Italic',
              fontSize: 12,
              lineHeight: 18,
              letterSpacing: 0.6,
              color: c.mutedForeground,
            }}
          >
            {rooms ? L('(one account. your book and your board travel both ways.)', '(tek hesap. defterin ve panon iki yerde de seninle.)') : '(tek hesap. sahnelerin ve metinlerin iki yerde de seninle.)'}
          </Text>

          <View style={{ marginTop: 18 }}>
            <PrimaryPill label={L('Open ghostlight.actor', "ghostlight.actor'e git")} onPress={visit} height={50} block haptic="medium" />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function Line({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <Ionicons name={icon} size={17} color={c.accentText} style={{ marginTop: 2 }} />
      <Text
        style={{
          flex: 1,
          fontFamily: 'BricolageGrotesque_500Medium',
          fontSize: 14,
          lineHeight: 20,
          color: c.foreground,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
