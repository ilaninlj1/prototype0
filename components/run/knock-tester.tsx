import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing, TapTarget } from '@/constants/theme';
import { runNative } from '@/lib/run-native';
import { createMotionTracker } from '@/lib/run-steps';
import type { RunProfile } from '@/lib/run-types';

/**
 * Practice tap to like: every tap the phone feels shows up, and every quick 2 or 3 taps is a like that buzzes and
 * counts. Jogging in place should count nothing; if it does, turn it off.
 */
export function KnockTester({ profile, onChange, onClose }: { profile: RunProfile; onChange: (p: RunProfile) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(0);
  const [taps, setTaps] = useState(0);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const native = runNative();

  useEffect(() => {
    if (!native) return;
    const tracker = createMotionTracker();
    const { Accelerometer } = native.sensors;
    Accelerometer.setUpdateInterval(10);
    const sub = Accelerometer.addListener((m) => {
      const t = Date.now();
      const r = tracker.push({ t, x: m.x, y: m.y, z: m.z });
      if (r.tap) setTaps((n) => n + 1);
      if (r.knock) {
        setCount((c) => c + 1);
        setLastAt(t);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    });
    return () => sub.remove();
  }, [native]);

  const turnOn = () => onChange({ ...profile, knockCalibrated: true, knockOn: true });
  const turnOff = () => onChange({ ...profile, knockCalibrated: true, knockOn: false });

  return (
    <View style={[styles.room, { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.lg }]}>
      <ThemedText style={styles.title}>Tap to like</ThemedText>
      {native ? (
        <>
          <ThemedText style={styles.line}>
            Put your phone in your pocket and tap it 2 or 3 times quickly, like knocking on a door. Each time it counts as a like, your phone buzzes.
            Then jog in place for a bit: steps should never count.
          </ThemedText>
          <View style={styles.center}>
            <ThemedText style={styles.count}>{count}</ThemedText>
            <ThemedText style={styles.line}>{count === 1 ? 'like' : 'likes'}</ThemedText>
            <ThemedText style={styles.small}>
              {taps === 1 ? '1 tap felt' : `${taps} taps felt`}
              {lastAt ? ` · last like ${Math.max(0, Math.round((Date.now() - lastAt) / 1000))} s ago` : ''}
            </ThemedText>
          </View>
          <Pressable
            onPress={() => {
              setCount(0);
              setTaps(0);
              setLastAt(null);
            }}
            style={styles.outline}>
            <ThemedText style={styles.outlineText}>Start over</ThemedText>
          </Pressable>
        </>
      ) : (
        <View style={styles.center}>
          <ThemedText style={styles.line}>Tap to like needs your phone's motion sensor. Open Blindspot on your phone to try it.</ThemedText>
        </View>
      )}
      <View style={styles.footer}>
        <Pressable onPress={profile.knockOn ? turnOff : turnOn} style={styles.link} hitSlop={8}>
          <ThemedText style={styles.linkText}>{profile.knockOn ? 'Turn tap to like off' : 'Turn tap to like on'}</ThemedText>
        </Pressable>
        <Pressable onPress={onClose} style={styles.link} hitSlop={8}>
          <ThemedText style={styles.linkText}>Done</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  room: { ...StyleSheet.absoluteFill, backgroundColor: Colors.background, paddingHorizontal: Spacing.lg, gap: Spacing.md },
  title: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text },
  line: { fontSize: 16, lineHeight: 22, color: Colors.textSecondary, textAlign: 'left' },
  small: { fontSize: 13, color: Colors.textSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  count: { fontFamily: Fonts.display, fontSize: 96, lineHeight: 104, color: Colors.signal },
  outline: {
    minHeight: TapTarget, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.hairline, alignItems: 'center', justifyContent: 'center',
  },
  outlineText: { fontSize: 16, fontWeight: '600', color: Colors.text },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { minHeight: TapTarget, justifyContent: 'center' },
  linkText: { fontSize: 15, color: Colors.text, textDecorationLine: 'underline' },
});
