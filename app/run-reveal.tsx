import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { saveLike } from '@/components/like-button';
import { DarkRoom } from '@/components/dark-room';
import { PaceLine } from '@/components/run/pace-line';
import { RouteMap } from '@/components/run/route-map';
import { ThemedText } from '@/components/themed-text';
import { Colors, DarkColors, Fonts, Radius, Spacing, TapTarget } from '@/constants/theme';
import { usePreviewWhileFocused } from '@/hooks/use-playback';
import { GOAL_NAMES, learnEasyPace } from '@/lib/run-goal';
import { formatClock, formatMiles, formatPace } from '@/lib/run-pace';
import { hardestHitting, mileAt, routeXY, summarize } from '@/lib/run-reveal';
import { loadRun, loadRunProfile, saveRun, saveRunProfile } from '@/lib/run-storage';
import type { RunRecord, RunSong, TalkAnswer } from '@/lib/run-types';

const TALK: { key: TalkAnswer; label: string }[] = [
  { key: 'yes', label: 'Yes' },
  { key: 'mostly', label: 'Mostly' },
  { key: 'no', label: 'No' },
];

/**
 * After a run: every song revealed, the pace line, the hardest-hitting song, then Songs and Route.
 * A light screen like the rest of the app; the pace line and the route sit on dark tiles.
 */
export default function RunRevealScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const [run, setRun] = useState<RunRecord | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<'songs' | 'route'>('songs');
  const [selected, setSelected] = useState<number | null>(null);
  const [playing, setPlaying] = useState<string | undefined>(undefined);
  const [talkDone, setTalkDone] = useState(fresh !== '1');
  usePreviewWhileFocused(playing);

  useEffect(() => {
    loadRun(String(id)).then((r) => (r ? setRun(r) : setMissing(true)));
  }, [id]);

  const inner = Math.min(width, 520) - Spacing.lg * 2;
  const hardest = useMemo(() => (run ? hardestHitting(run.played, run.points) : null), [run]);
  const summary = useMemo(() => (run ? summarize(run) : null), [run]);
  const hasRoute = useMemo(() => (run ? routeXY(run.points, 100, 100, 0) != null : false), [run]);

  if (!run || !summary)
    return (
      <View style={[styles.room, { paddingTop: insets.top + Spacing.xl }]}>
        <ThemedText style={styles.line}>{missing ? "This run isn't on your phone anymore." : 'Revealing your run…'}</ThemedText>
      </View>
    );

  const update = (change: (r: RunRecord) => RunRecord) => {
    const next = change(run);
    setRun(next);
    void saveRun(next);
  };

  const answer = async (talk: TalkAnswer | null) => {
    setTalkDone(true);
    if (!talk) return;
    update((r) => ({ ...r, talk }));
    if (run.simulated) return;
    const profile = await loadRunProfile();
    await saveRunProfile({ ...profile, easyPace: learnEasyPace(profile, { avgPace: summary.avgPace, goal: run.goal, talk }) });
  };

  const keep = (indexes: number[]) => {
    for (const i of indexes) void saveLike({ ...run.played[i].track, via: 'run' });
    update((r) => ({ ...r, played: r.played.map((s, i) => (indexes.includes(i) ? { ...s, kept: true } : s)) }));
  };

  const play = (i: number) => {
    setSelected(i);
    setPlaying(run.played[i].track.previewUrl);
  };
  const toggle = (i: number) => {
    if (selected === i && playing) setPlaying(undefined);
    else play(i);
  };

  const legs = run.played.map((s, i) => (s.liked === 'legs' && !s.kept ? i : -1)).filter((i) => i >= 0);
  const youCount = run.played.filter((s) => s.liked === 'you').length;
  const legsCount = run.played.filter((s) => s.liked === 'legs').length;
  const day = new Date(run.startedAt).toLocaleDateString(undefined, { weekday: 'long' });
  const featured = selected ?? hardest;
  const featuredSong = featured != null ? run.played[featured] : null;
  const speedOf = (s: RunSong) => {
    const v = run.points.filter((p) => p.t >= s.start && p.t < s.end && p.speed != null).map((p) => p.speed!);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  return (
    <>
      <ScrollView style={styles.room} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom + Spacing.xxl }]}>
        <View style={styles.header}>
          <ThemedText style={styles.eyebrow}>
            {day} {summary.walk ? 'walk' : 'run'} · revealed{run.simulated ? ' · simulated' : ''}
          </ThemedText>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/play'))} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={Colors.text} />
          </Pressable>
        </View>

        {!talkDone && !run.talk ? (
          <View style={styles.talk}>
            <ThemedText style={styles.talkTitle}>Could you talk the whole time?</ThemedText>
            <ThemedText style={styles.small}>Your answer sets next run's {GOAL_NAMES.easy.toLowerCase()} pace.</ThemedText>
            <View style={styles.talkRow}>
              {TALK.map((t) => (
                <Pressable key={t.key} onPress={() => answer(t.key)} style={styles.talkButton} accessibilityRole="button">
                  <ThemedText style={styles.talkText}>{t.label}</ThemedText>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => answer(null)} hitSlop={8} style={styles.skip}>
              <ThemedText style={styles.small}>Skip</ThemedText>
            </Pressable>
          </View>
        ) : null}

        <ThemedText style={styles.headline}>{summary.headline}</ThemedText>
        <View style={styles.stats}>
          <Stat value={formatClock(summary.durationMs)} label="time" />
          <Stat value={formatMiles(summary.distanceM)} label="distance" />
          {summary.onGoalPct != null ? (
            <Stat value={`${Math.round(summary.onGoalPct * 100)}%`} label={`on ${GOAL_NAMES[run.goal]}`} />
          ) : (
            <Stat value={formatPace(summary.avgPace)} label="min / mile" />
          )}
        </View>

        {run.played.length > 0 ? (
          <DarkRoom>
            <View style={styles.chartTile}>
              <PaceLine run={run} width={inner - Spacing.md * 2} height={210} hardest={hardest} selected={selected} onSelect={play} />
            </View>
          </DarkRoom>
        ) : (
          <ThemedText style={styles.line}>No songs finished on this one.</ThemedText>
        )}
        {run.played.length > 0 ? <ThemedText style={styles.small}>Each bar is a song. Drag along them to hear and reveal each one.</ThemedText> : null}

        {featuredSong ? (
          <>
            <ThemedText style={[styles.label, { marginTop: Spacing.lg }]}>{selected == null ? 'Hardest-hitting song' : `Song ${selected + 1} of ${run.played.length}`}</ThemedText>
            <Pressable onPress={() => toggle(featured!)} style={styles.hero} accessibilityRole="button">
              <Image source={{ uri: featuredSong.track.artworkUrl100.replace('100x100', '300x300') }} style={styles.heroArt} />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.heroTitle} numberOfLines={2}>
                  {featuredSong.track.trackName}
                </ThemedText>
                <ThemedText style={styles.muted} numberOfLines={1}>
                  {featuredSong.track.artistName}
                </ThemedText>
                <ThemedText style={styles.heroPace}>
                  {speedOf(featuredSong) ? `${formatPace(1000 / speedOf(featuredSong)!)} /mi` : ''}
                  {featured === hardest ? ' · your fastest' : ` · mile ${mileAt(run.points, featuredSong.start).toFixed(1)}`}
                </ThemedText>
              </View>
              <Ionicons name={playing && selected === featured ? 'pause' : 'play'} size={22} color={Colors.text} />
            </Pressable>
          </>
        ) : null}

        <View style={styles.seg}>
          <SegButton label="Songs" on={tab === 'songs'} onPress={() => setTab('songs')} />
          {hasRoute ? <SegButton label="Route" on={tab === 'route'} onPress={() => setTab('route')} /> : null}
        </View>

        {tab === 'songs' || !hasRoute ? (
          <View>
            <ThemedText style={styles.label}>
              {run.played.length} songs · {youCount} you liked · {legsCount} your legs liked
            </ThemedText>
            {run.played.map((s, i) => (
              <Pressable key={`${s.track.id}-${i}`} onPress={() => toggle(i)} style={[styles.song, selected === i && styles.songOn]} accessibilityRole="button">
                <Image source={{ uri: s.track.artworkUrl100 }} style={styles.art} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.songTitle} numberOfLines={1}>
                    {s.track.trackName}
                  </ThemedText>
                  <ThemedText style={styles.songSub} numberOfLines={1}>
                    {s.track.artistName} · mile {mileAt(run.points, s.start).toFixed(1)}
                  </ThemedText>
                </View>
                {s.liked === 'you' ? <ThemedText style={[styles.tag, styles.tagYou]}>you liked</ThemedText> : null}
                {s.liked === 'legs' && !s.kept ? (
                  <Pressable onPress={() => keep([i])} style={[styles.tag, styles.tagLegs]} accessibilityRole="button" accessibilityLabel="Keep this song">
                    <ThemedText style={styles.tagLegsText}>legs liked · keep</ThemedText>
                  </Pressable>
                ) : null}
                {s.liked === 'legs' && s.kept ? <ThemedText style={[styles.tag, styles.tagYou]}>kept</ThemedText> : null}
              </Pressable>
            ))}
            {legsCount > 0 ? <ThemedText style={[styles.small, { marginTop: Spacing.md }]}>Legs-liked songs aren&apos;t saved until you keep them.</ThemedText> : null}
            {legs.length > 0 ? (
              <Pressable onPress={() => keep(legs)} style={styles.keepAll} accessibilityRole="button">
                <ThemedText style={styles.keepAllText}>Keep all {legs.length}</ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: Spacing.sm }}>
            <DarkRoom>
              <RouteMap run={run} width={inner} height={Math.round(inner * 1.05)} hardest={hardest} onSelect={play} />
            </DarkRoom>
            <ThemedText style={styles.small}>Only you see the map. Shared pictures never show your route.</ThemedText>
          </View>
        )}

        <Pressable onPress={() => router.push('/runs')} style={styles.link} hitSlop={8}>
          <ThemedText style={styles.linkText}>Past runs</ThemedText>
        </Pressable>
      </ScrollView>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
    </View>
  );
}

function SegButton({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.segButton, on && styles.segOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <ThemedText style={[styles.segText, on && { color: Colors.accentText }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  room: { flex: 1, backgroundColor: Colors.background },
  // Sound and route art always sit on dark.
  chartTile: { backgroundColor: DarkColors.background, borderRadius: 20, padding: Spacing.md },
  content: { paddingHorizontal: Spacing.lg, gap: Spacing.md, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.textSecondary },
  close: { width: TapTarget, height: TapTarget, alignItems: 'center', justifyContent: 'center', marginRight: -Spacing.sm },
  talk: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
  talkTitle: { fontFamily: Fonts.displayBold, fontSize: 20, color: Colors.text },
  talkRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  talkButton: { flex: 1, minHeight: TapTarget + 4, borderRadius: (TapTarget + 4) / 2, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  talkText: { fontSize: 16, fontWeight: '600', color: Colors.accentText },
  skip: { alignSelf: 'center', minHeight: TapTarget, justifyContent: 'center' },
  headline: { fontFamily: Fonts.display, fontSize: 30, lineHeight: 34, color: Colors.text, marginTop: Spacing.xs },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  statValue: { fontFamily: Fonts.monoMedium, fontSize: 20, color: Colors.text },
  statLabel: { fontSize: 12, color: Colors.textSecondary },
  line: { fontSize: 16, color: Colors.textSecondary },
  small: { fontSize: 13, color: Colors.textSecondary },
  muted: { fontSize: 14, color: Colors.textSecondary },
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.textSecondary },
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg },
  heroArt: { width: 64, height: 64, borderRadius: Radius.md },
  heroTitle: { fontFamily: Fonts.displayBold, fontSize: 17, color: Colors.text },
  heroPace: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.text, marginTop: 4 },
  seg: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 22, padding: 3, marginTop: Spacing.md },
  segButton: { flex: 1, minHeight: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.accent },
  segText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  song: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  songOn: { backgroundColor: Colors.surface },
  art: { width: 40, height: 40, borderRadius: Radius.sm },
  songTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  songSub: { fontSize: 12, color: Colors.textSecondary },
  tag: { fontFamily: Fonts.sansSemiBold, fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, overflow: 'hidden' },
  tagYou: { backgroundColor: Colors.accent, color: Colors.accentText },
  tagLegs: { borderWidth: 1, borderColor: Colors.text, minHeight: 32, justifyContent: 'center' },
  tagLegsText: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Colors.text },
  keepAll: { minHeight: 52, borderRadius: 26, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md },
  keepAllText: { fontSize: 16, fontWeight: '700', color: Colors.accentText },
  link: { minHeight: TapTarget, justifyContent: 'center', alignSelf: 'center', marginTop: Spacing.lg },
  linkText: { fontSize: 15, color: Colors.text, textDecorationLine: 'underline' },
});
