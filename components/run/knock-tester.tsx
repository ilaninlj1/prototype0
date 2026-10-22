import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { DarkColors, Fonts, Radius, Spacing, TapTarget } from '@/constants/theme';
import { runNative } from '@/lib/run-native';
import { createMotionTracker } from '@/lib/run-steps';
import type { RunProfile } from '@/lib/run-types';

const NEEDED = 3;

/**
 * Try knock to like before trusting it: every double knock the phone feels buzzes and counts. Three in a row turn it on.
 * Jogging in place should count nothing; if it does, leave it off.
 */
export function KnockTester({ profile, onChange, onClose }: { profile: RunProfile; onChange: (p: RunProfile) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(0);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const native = runNative();

  useEffect(() => {
    if (!native) return;
    const tracker = createMotionTracker();
    const { Accelerometer } = native.sensors;
    Accelerometer.setUpdateInterval(10);
    const sub = Accelerometer.addListener((m) => {
      const t = Date.now();
      if (tracker.push({ t, x: m.x, y: m.y, z: m.z }).knock) {
        setCount((c) => c + 1);
        setLastAt(t);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    });
    return () => sub.remove();
  }, [native]);

  const ready = count >= NEEDED;
  const turnOn = () => onChange({ ...profile, knockCalibrated: true, knockOn: true });
  const turnOff = () => onChange({ ...profile, knockOn: false });

  return (
    <View style={[styles.room, { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.lg }]}>
      <ThemedText style={styles.title}>Knock to like</ThemedText>
      {native ? (
        <>
          <ThemedText style={styles.line}>
            Put your phone in your pocket and knock on it twice, like knocking on a door. Do that three times. Then jog in place for a bit: footsteps should
            never count.
          </ThemedText>
          <View style={styles.center}>
            <ThemedText style={styles.count}>{count}</ThemedText>
            <ThemedText style={styles.line}>{count === 1 ? 'double knock felt' : 'double knocks felt'}</ThemedText>
            {lastAt ? <ThemedText style={styles.small}>Last one {Math.max(0, Math.round((Date.now() - lastAt) / 1000))} s ago</ThemedText> : null}
          </View>
          <Pressable onPress={() => setCount(0)} style={styles.outline}>
            <ThemedText style={styles.outlineText}>Start over</ThemedText>
          </Pressable>
          <Pressable onPress={turnOn} disabled={!ready} style={[styles.go, !ready && { opacity: 0.4 }]}>
            <ThemedText style={styles.goText}>{ready ? 'It works, turn it on' : `${NEEDED - Math.min(count, NEEDED)} more to go`}</ThemedText>
          </Pressable>
        </>
      ) : (
        <View style={styles.center}>
          <ThemedText style={styles.line}>Knock to like needs your phone's motion sensor. Open Blindspot on your phone to try it.</ThemedText>
        </View>
      )}
      <View style={styles.footer}>
        {profile.knockOn ? (
          <Pressable onPress={turnOff} style={styles.link} hitSlop={8}>
            <ThemedText style={styles.linkText}>Turn knock to like off</ThemedText>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable onPress={onClose} style={styles.link} hitSlop={8}>
          <ThemedText style={styles.linkText}>Done</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  room: { ...StyleSheet.absoluteFill, backgroundColor: DarkColors.background, paddingHorizontal: Spacing.lg, gap: Spacing.md },
  title: { fontFamily: Fonts.display, fontSize: 28, color: DarkColors.text },
  line: { fontSize: 16, lineHeight: 22, color: DarkColors.textSecondary, textAlign: 'left' },
  small: { fontSize: 13, color: DarkColors.textTertiary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  count: { fontFamily: Fonts.display, fontSize: 96, lineHeight: 104, color: DarkColors.signal },
  outline: {
    minHeight: TapTarget, borderRadius: Radius.md, borderWidth: 1, borderColor: DarkColors.hairline, alignItems: 'center', justifyContent: 'center',
  },
  outlineText: { fontSize: 16, fontWeight: '600', color: DarkColors.text },
  go: { minHeight: 56, borderRadius: Radius.lg, backgroundColor: DarkColors.signal, alignItems: 'center', justifyContent: 'center' },
  goText: { fontFamily: Fonts.display, fontSize: 18, color: '#f3ead8' },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { minHeight: TapTarget, justifyContent: 'center' },
  linkText: { fontSize: 15, color: DarkColors.text, textDecorationLine: 'underline' },
});
