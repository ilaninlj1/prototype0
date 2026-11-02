import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DarkRoom } from '@/components/dark-room';
import { ThemedText } from '@/components/themed-text';
import { DarkColors, Fonts, Radius, Spacing, TapTarget } from '@/constants/theme';
import { chanceSentence, personPrintSeeds, type Person } from '@/lib/people';
import { loadLikedTracks } from '@/lib/discovery-storage';
import { soundFor } from '@/lib/sound-index';
import { wave } from '@/lib/twins-api';
import type { RingSeed } from '@/lib/bottle-rows';
import { PersonPrint } from './person-print';

const PRINT = 148;
const MEET_MS = 900;
const OVERLAP = PRINT * 0.3;

function Ripple({ delay, skip }: { delay: number; skip: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!skip) t.set(withDelay(delay, withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) })));
  }, [delay, skip, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.get() === 0 ? 0 : 0.55 * (1 - t.get()),
    transform: [{ scale: 0.25 + 2.4 * t.get() }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.ripple, style]} />;
}

/**
 * Someone new is in tune with you: your print and theirs drift in from the edges and overlap,
 * a ripple runs out from where they meet, one haptic. Plays once per person.
 */
export function InTuneMoment({ person, onClose, onWaved }: { person: Person; onClose: () => void; onWaved: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [mine, setMine] = useState<RingSeed[]>([]);
  const [note, setNote] = useState('');
  const from = width / 2 + PRINT;
  const left = useSharedValue(reduceMotion ? -OVERLAP : -from);
  const right = useSharedValue(reduceMotion ? OVERLAP : from);

  useEffect(() => {
    loadLikedTracks().then((liked) => setMine(personPrintSeeds(liked, (id) => soundFor(id))));
    const ease = { duration: MEET_MS, easing: Easing.bezier(0.2, 0.8, 0.2, 1) };
    if (!reduceMotion) {
      left.set(withTiming(-OVERLAP, ease));
      right.set(withTiming(OVERLAP, ease));
    }
    const buzz = setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), reduceMotion ? 0 : MEET_MS - 150);
    return () => clearTimeout(buzz);
    // Runs once, when the moment opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: left.get() }] }));
  const rightStyle = useAnimatedStyle(() => ({ transform: [{ translateX: right.get() }] }));
  const core = person.row.shared_tracks[0] ?? 0;
  const words = reduceMotion ? 0 : MEET_MS;

  async function sayHi() {
    if (await wave(person.row.person)) onWaved();
    else setNote('Couldn’t wave just now. Try again.');
  }

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <DarkRoom>
        <View style={[styles.room, { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl }]}>
          <View style={styles.meet} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ripple delay={words - 200} skip={reduceMotion} />
            <Ripple delay={words + 150} skip={reduceMotion} />
            <Animated.View style={[styles.print, leftStyle]}>
              <PersonPrint trackId={core} rings={mine} size={PRINT} />
            </Animated.View>
            <Animated.View style={[styles.print, rightStyle]}>
              <PersonPrint trackId={core} rings={person.row.print} size={PRINT} />
            </Animated.View>
          </View>
          <Animated.View entering={FadeIn.delay(words).duration(400)} style={styles.words}>
            <ThemedText type="title" style={styles.center} numberOfLines={2} accessibilityRole="header">
              In tune with {person.row.name}
            </ThemedText>
            <ThemedText style={[styles.center, styles.sentence]}>{chanceSentence(person.score.shared, person.score.expected)}</ThemedText>
            {!!note && <ThemedText style={styles.center}>{note}</ThemedText>}
          </Animated.View>
          <Animated.View entering={FadeIn.delay(words + 300).duration(300)} style={styles.actions}>
            <Pressable onPress={sayHi} accessibilityRole="button" style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <ThemedText style={styles.primaryText}>{person.row.they_waved ? 'Wave back' : 'Wave'}</ThemedText>
            </Pressable>
            <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8} style={styles.later}>
              <ThemedText style={styles.laterText}>Later</ThemedText>
            </Pressable>
          </Animated.View>
        </View>
      </DarkRoom>
    </Modal>
  );
}

const styles = StyleSheet.create({
  room: { flex: 1, backgroundColor: DarkColors.background, paddingHorizontal: Spacing.xl, justifyContent: 'space-between' },
  meet: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  print: { position: 'absolute' },
  ripple: { position: 'absolute', width: PRINT, height: PRINT, borderRadius: PRINT / 2, borderWidth: 1.5, borderColor: DarkColors.text },
  words: { gap: Spacing.sm, marginBottom: Spacing.xxl },
  center: { textAlign: 'center' },
  sentence: { color: DarkColors.textSecondary },
  actions: { gap: Spacing.sm, alignItems: 'center' },
  primary: { alignSelf: 'stretch', minHeight: 52, borderRadius: Radius.lg, backgroundColor: DarkColors.accent, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
  primaryText: { color: DarkColors.accentText, fontFamily: Fonts.sansSemiBold, fontSize: 16 },
  later: { minHeight: TapTarget, justifyContent: 'center', paddingHorizontal: Spacing.lg },
  laterText: { color: DarkColors.textSecondary },
});
