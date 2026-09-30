import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { historyLine, type ChartEntry, type Move } from '@/lib/charts';
import { COUNTRIES, loadChart, peekChart, type Chart } from '@/lib/charts-api';
import { artworkUrl } from '@/lib/discovery';
import { shouldSkip } from '@/lib/human-check-api';
import { pickLesserKnown } from '@/lib/song-facts';

/** World Charts: any country's top 50, what's rising since yesterday, and "hear it blind". */
export default function ChartsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ country?: string }>();
  const [country, setCountry] = useState(params.country ?? 'us');
  const [chart, setChart] = useState<Chart | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Show the phone's last copy right away, then swap in today's.
    peekChart(country).then((c) => !cancelled && c && setChart((cur) => cur ?? c));
    loadChart(country).then((c) => !cancelled && setChart(c));
    return () => {
      cancelled = true;
    };
  }, [country]);

  const name = COUNTRIES.find((c) => c.code === country)?.name ?? country.toUpperCase();
  const openSong = (e: ChartEntry) => router.push({ pathname: '/song', params: { id: String(e.id), country } });

  const [picking, setPicking] = useState(false);
  async function hearBlind() {
    if (!chart || picking) return;
    setPicking(true);
    // Five from the top 25, passing over any artist tagged as AI (unless AI music is on).
    const five: ChartEntry[] = [];
    for (const e of pickLesserKnown(chart.entries.slice(0, 25), 20)) {
      if (five.length === 5) break;
      if (!(await shouldSkip(e.artist))) five.push(e);
    }
    setPicking(false);
    router.push({ pathname: '/pack', params: { ids: five.map((e) => e.id).join(','), from: name, kind: 'region', country } });
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + Spacing.md }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </Pressable>
        <ThemedText type="eyebrow">World charts · Apple Music most played</ThemedText>
        <ThemedText type="title">{name}</ThemedText>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipRow}>
          {COUNTRIES.map((c) => {
            const on = c.code === country;
            return (
              <Pressable
                key={c.code}
                onPress={() => {
                  if (on) return;
                  setChart(null);
                  setCountry(c.code);
                }}
                style={[styles.chip, on && styles.chipOn]}>
                <ThemedText style={[styles.chipCode, on && styles.chipOnText]}>{c.code.toUpperCase()}</ThemedText>
                <ThemedText style={[styles.chipName, on && styles.chipOnText]}>{c.name}</ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        {!chart ? (
          <ActivityIndicator color={Colors.text} style={{ marginTop: Spacing.xl }} />
        ) : chart.entries.length === 0 ? (
          <ThemedText style={styles.note}>Apple&apos;s chart for {name} didn&apos;t load. Try again in a minute.</ThemedText>
        ) : (
          <>
            <PressableScale onPress={hearBlind} style={styles.blind}>
              <View style={styles.blindText}>
                <ThemedText style={styles.blindTitle}>{picking ? 'Picking 5 songs…' : `Hear ${name} blind`}</ThemedText>
                <ThemedText style={styles.blindSub}>5 songs from its top 25. No names until the end.</ThemedText>
              </View>
              <Ionicons name="headset" size={26} color={Colors.accentText} />
            </PressableScale>

            <ThemedText type="eyebrow" style={styles.section}>
              Rising fastest · {chart.risingSpan}
            </ThemedText>
            {!chart.hasHistory || chart.rising.length === 0 ? (
              <ThemedText style={styles.note}>
                {chart.hasHistory ? 'Nothing climbed today. Quiet day.' : 'Arrows start tomorrow. Today’s chart is saved to compare against.'}
              </ThemedText>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.risers}>
                {chart.rising.map((e) => (
                  <Pressable key={e.id} style={styles.riser} onPress={() => openSong(e)}>
                    <Image source={{ uri: artworkUrl(e.artworkUrl, 300) }} style={styles.riserArt} />
                    <MoveTag move={chart.risingMoves[e.id]} big />
                    <ThemedText style={styles.riserTitle} numberOfLines={1}>
                      {e.title}
                    </ThemedText>
                    <ThemedText style={styles.dim} numberOfLines={1}>
                      {e.artist}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <ThemedText type="eyebrow" style={styles.section}>
              Top 50 · {chart.day}
            </ThemedText>
            {chart.entries.map((e) => (
              <Pressable key={e.id} style={styles.row} onPress={() => openSong(e)}>
                <ThemedText style={styles.rank}>{e.rank}</ThemedText>
                <Image source={{ uri: artworkUrl(e.artworkUrl, 200) }} style={styles.rowArt} />
                <View style={styles.rowText}>
                  <ThemedText style={styles.rowTitle} numberOfLines={1}>
                    {e.title}
                  </ThemedText>
                  <ThemedText style={styles.dim} numberOfLines={1}>
                    {e.artist}
                  </ThemedText>
                  {historyLine(e.rank, chart.history[e.id]) && (
                    <ThemedText style={[styles.history, e.rank <= (chart.history[e.id]?.peak ?? 0) && styles.historyPeak]}>
                      {historyLine(e.rank, chart.history[e.id])}
                    </ThemedText>
                  )}
                </View>
                <MoveTag move={chart.moves[e.id]} />
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** ▲5 in gold, ▼3 in grey, NEW in red; nothing when there's no history. */
function MoveTag({ move, big }: { move?: Move; big?: boolean }) {
  if (!move) return null;
  const size = big ? 15 : 12;
  if (move.isNew) return <ThemedText style={[styles.move, { fontSize: size, color: Colors.signal }]}>NEW</ThemedText>;
  if (!move.delta) return <ThemedText style={[styles.move, { fontSize: size, color: Colors.textTertiary }]}>–</ThemedText>;
  const up = move.delta > 0;
  return (
    <ThemedText style={[styles.move, { fontSize: size, color: up ? Colors.highlight : Colors.textTertiary }]}>
      {up ? '▲' : '▼'}
      {Math.abs(move.delta)}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.xs },
  back: { alignSelf: 'flex-start', marginBottom: Spacing.sm },
  chipRow: { marginHorizontal: -Spacing.lg, marginTop: Spacing.md },
  chips: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  chip: { backgroundColor: Colors.surface, borderRadius: Radius.pill, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, flexDirection: 'row', gap: 6, alignItems: 'baseline' },
  chipOn: { backgroundColor: Colors.accent },
  chipCode: { fontFamily: Fonts.monoMedium, fontSize: 12, color: Colors.signal },
  chipName: { fontFamily: 'Figtree_600SemiBold', fontSize: 14, color: Colors.text },
  chipOnText: { color: Colors.accentText },
  blind: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.accent, borderRadius: Radius.lg, padding: Spacing.lg, marginTop: Spacing.lg },
  blindText: { flex: 1, gap: 2 },
  blindTitle: { fontFamily: Fonts.displayBold, fontSize: 18, lineHeight: 22, color: Colors.accentText },
  blindSub: { fontSize: 13, lineHeight: 17, color: Colors.accentText, opacity: 0.75 },
  section: { marginTop: Spacing.xl, marginBottom: Spacing.sm },
  note: { fontFamily: Fonts.note, fontSize: 20, lineHeight: 24, color: Colors.textSecondary },
  risers: { gap: Spacing.md },
  riser: { width: 128, gap: 2 },
  riserArt: { width: 128, height: 128, borderRadius: Radius.md, marginBottom: 4 },
  riserTitle: { fontFamily: 'Figtree_700Bold', fontSize: 14, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 6 },
  rank: { fontFamily: Fonts.display, fontSize: 18, width: 28, color: Colors.textSecondary, textAlign: 'right' },
  rowArt: { width: 48, height: 48, borderRadius: Radius.sm },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: 'Figtree_700Bold', fontSize: 15, lineHeight: 19 },
  dim: { fontSize: 13, lineHeight: 17, color: Colors.textSecondary },
  history: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 14, color: Colors.textTertiary, marginTop: 1 },
  historyPeak: { color: Colors.highlight },
  move: { fontFamily: Fonts.monoMedium, minWidth: 34, textAlign: 'right' },
});
