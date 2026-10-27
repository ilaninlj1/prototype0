import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DarkColors, Fonts, Radius, Spacing, TapTarget } from '@/constants/theme';
import { GOAL_NAMES } from '@/lib/run-goal';
import { formatPace, MILE_M } from '@/lib/run-pace';
import type { Goal, RunProfile, SongsMode } from '@/lib/run-types';

const GOALS: { key: Goal; line: string }[] = [
  { key: 'easy', line: 'You could still chat the whole way.' },
  { key: 'steady', line: 'You can get out short phrases.' },
  { key: 'push', line: 'Just a few words at a time.' },
];

const SONGS: { key: SongsMode; label: string; line: string }[] = [
  { key: 'blind', label: 'Blind', line: "Only songs you've never heard." },
  { key: 'mix', label: 'Mix', line: 'Mostly your saves, with a blind song every third track.' },
  { key: 'liked', label: 'Liked', line: 'Only songs you already saved.' },
];

/** "10:30" per mile → s/km, or null when it doesn't read as a pace. */
export function parseMilePace(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return null;
  const perMile = Number(m[1]) * 60 + Number(m[2]);
  return perMile >= 240 && perMile <= 1800 ? perMile / (MILE_M / 1000) : null;
}

type Props = {
  profile: RunProfile;
  busy: boolean;
  problem: 'denied' | 'unsupported' | null;
  hasRuns: boolean;
  onStart: (o: { goal: Goal; songs: SongsMode; typedPace: number | null; noGps?: boolean }) => void;
  onKnock: () => void;
  onRuns: () => void;
};

export function RunSetup({ profile, busy, problem, hasRuns, onStart, onKnock, onRuns }: Props) {
  const [goal, setGoal] = useState<Goal>('easy');
  const [songs, setSongs] = useState<SongsMode>('mix');
  const [typing, setTyping] = useState(false);
  const [paceText, setPaceText] = useState('');
  const typedPace = typing ? parseMilePace(paceText) : null;
  const badPace = typing && paceText.length > 0 && typedPace == null;
  const start = (noGps?: boolean) => onStart({ goal, songs, typedPace, noGps });

  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.label}>How hard</ThemedText>
      <View style={styles.chips}>
        {GOALS.map((g) => (
          <Chip key={g.key} label={GOAL_NAMES[g.key]} on={goal === g.key && !typing} onPress={() => {
              setGoal(g.key);
              setTyping(false);
            }}
          />
        ))}
      </View>
      <ThemedText style={styles.line}>{typing ? 'Your own pace, per mile.' : GOALS.find((g) => g.key === goal)!.line}</ThemedText>
      {profile.easyPace && !typing ? (
        <ThemedText style={styles.small}>Your easy pace right now is about {formatPace(profile.easyPace)} a mile.</ThemedText>
      ) : null}

      {typing ? (
        <View style={styles.paceRow}>
          <TextInput
            value={paceText}
            onChangeText={setPaceText}
            placeholder="10:30"
            placeholderTextColor={DarkColors.textTertiary}
            keyboardType="numbers-and-punctuation"
            style={styles.paceInput}
            accessibilityLabel="Pace per mile, minutes and seconds"
          />
          <ThemedText style={styles.line}>per mile</ThemedText>
        </View>
      ) : null}
      {badPace ? <ThemedText style={styles.small}>Type it like 10:30.</ThemedText> : null}
      <Pressable onPress={() => setTyping((v) => !v)} hitSlop={8} style={styles.link}>
        <ThemedText style={styles.linkText}>{typing ? 'Pick easy, steady or push instead' : 'Type a pace instead'}</ThemedText>
      </Pressable>

      <ThemedText style={[styles.label, { marginTop: Spacing.lg }]}>Songs</ThemedText>
      <View style={styles.chips}>
        {SONGS.map((s) => (
          <Chip key={s.key} label={s.label} on={songs === s.key} onPress={() => setSongs(s.key)} />
        ))}
      </View>
      <ThemedText style={styles.line}>{SONGS.find((s) => s.key === songs)!.line}</ThemedText>

      <View style={{ flex: 1 }} />

      {problem === 'denied' ? (
        <View style={styles.problem}>
          <ThemedText style={styles.line}>Run mode needs your location to measure your pace. You can turn it on in Settings.</ThemedText>
          <Pressable onPress={() => start(true)} style={styles.outline}>
            <ThemedText style={styles.outlineText}>Start without pace</ThemedText>
          </Pressable>
        </View>
      ) : null}
      {problem === 'unsupported' ? (
        <ThemedText style={[styles.line, styles.problem]}>This version of the app can't run yet. Update to the newest version to use Run.</ThemedText>
      ) : null}

      <Pressable
        onPress={() => start()}
        disabled={busy || badPace || problem === 'unsupported'}
        style={({ pressed }) => [styles.go, (busy || badPace) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
        accessibilityRole="button">
        <ThemedText style={styles.goText}>{busy ? 'Starting…' : 'Start'}</ThemedText>
      </Pressable>
      <View style={styles.footer}>
        <Pressable onPress={onKnock} hitSlop={8} style={styles.link}>
          <ThemedText style={styles.linkText}>{profile.knockOn ? 'Tap to like is on' : 'Tap to like is off'}</ThemedText>
        </Pressable>
        {hasRuns ? (
          <Pressable onPress={onRuns} hitSlop={8} style={styles.link}>
            <ThemedText style={styles.linkText}>Past runs</ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}>
      <ThemedText style={[styles.chipText, on && { color: DarkColors.accentText }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  label: { fontSize: 14, fontWeight: '600', color: DarkColors.textSecondary, marginBottom: Spacing.sm },
  chips: { flexDirection: 'row', gap: Spacing.sm },
  chip: {
    flex: 1, minHeight: TapTarget + 4, borderRadius: Radius.lg, borderWidth: 1, borderColor: DarkColors.hairline,
    alignItems: 'center', justifyContent: 'center',
  },
  chipOn: { backgroundColor: DarkColors.accent, borderColor: DarkColors.accent },
  chipText: { fontSize: 16, fontWeight: '600', color: DarkColors.text },
  line: { fontSize: 15, color: DarkColors.textSecondary, marginTop: Spacing.sm },
  small: { fontSize: 13, color: DarkColors.textTertiary, marginTop: Spacing.xs },
  paceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  paceInput: {
    minWidth: 96, minHeight: TapTarget, borderRadius: Radius.md, borderWidth: 1, borderColor: DarkColors.hairline,
    color: DarkColors.text, fontFamily: Fonts.mono, fontSize: 22, paddingHorizontal: Spacing.md,
  },
  link: { minHeight: TapTarget, justifyContent: 'center' },
  linkText: { fontSize: 15, color: DarkColors.text, textDecorationLine: 'underline' },
  problem: { gap: Spacing.sm, marginBottom: Spacing.md },
  outline: {
    minHeight: TapTarget, borderRadius: Radius.md, borderWidth: 1, borderColor: DarkColors.hairline,
    alignItems: 'center', justifyContent: 'center',
  },
  outlineText: { fontSize: 16, fontWeight: '600', color: DarkColors.text },
  go: { minHeight: 60, borderRadius: Radius.lg, backgroundColor: DarkColors.signal, alignItems: 'center', justifyContent: 'center' },
  goText: { fontFamily: Fonts.display, fontSize: 20, color: '#f3ead8' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
});
