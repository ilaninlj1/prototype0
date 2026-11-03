import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet, SheetHeader } from '@/components/ui/sheet';
import { Colors, DarkColors, Spacing, Ui } from '@/constants/theme';
import { journeySummary } from '@/lib/bottle-journey';
import type { Bottle } from '@/lib/bottle-rows';

import { BottlePrint } from './bottle-print';

const PRINT = 168;

function day(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Where one bottle has been: its print, a one-line summary, and every stop with its city and day. */
export function JourneySheet({ bottle, title, note = false, onClose }: { bottle: Bottle | null; title: string; note?: boolean; onClose: () => void }) {
  const router = useRouter();
  function openSea(id: string) {
    onClose();
    router.push({ pathname: '/sea', params: { bottle: id } });
  }
  return (
    <BottomSheet visible={!!bottle} onClose={onClose}>
      {bottle && (
        <>
          <SheetHeader title={title} onDone={onClose} />
          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.tile}>
              <BottlePrint trackId={bottle.trackId} hops={bottle.hops} size={PRINT} />
            </View>
            <View style={note ? styles.paper : null}>
              {note && <ThemedText type="caption" style={styles.center}>A bottle you sent out or kept. No one can write in these: the note is where it has been.</ThemedText>}
              <ThemedText style={styles.summary}>{journeySummary(bottle)}</ThemedText>
              <ThemedText type="caption" style={styles.center}>
                The middle is the song. Each ring is someone who kept it, drawn from the song they had saved just before.
              </ThemedText>
            </View>
            <Pressable onPress={() => openSea(bottle.id)} style={[Ui.outlineButton, styles.sea]} accessibilityRole="button">
              <ThemedText style={Ui.label}>See it on the Sea</ThemedText>
            </Pressable>
            <View style={styles.list}>
              {bottle.hops.map((h, i) => (
                <View key={i} style={styles.hop} accessible accessibilityLabel={`${h.kind === 'launch' ? 'Found blind' : 'Kept'} in ${h.city}, ${day(h.at)}`}>
                  <View style={[styles.dot, h.kind === 'launch' && styles.dotFirst]} />
                  <View style={styles.hopWords}>
                    <ThemedText style={styles.city}>{h.city}</ThemedText>
                    <ThemedText type="caption">{h.kind === 'launch' ? 'Found blind' : 'Kept'}</ThemedText>
                  </View>
                  <ThemedText type="caption">{day(h.at)}</ThemedText>
                </View>
              ))}
            </View>
          </ScrollView>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: Spacing.lg, paddingTop: 0, gap: Spacing.md, alignItems: 'stretch' },
  tile: { alignSelf: 'center', width: PRINT, height: PRINT, borderRadius: 28, overflow: 'hidden', backgroundColor: DarkColors.background },
  paper: { backgroundColor: '#f6efdf', borderRadius: 6, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, gap: Spacing.xs, transform: [{ rotate: '-0.6deg' }] },
  summary: { fontSize: 17, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  center: { textAlign: 'center' },
  sea: { alignSelf: 'center' },
  list: { gap: Spacing.sm, marginTop: Spacing.sm },
  hop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.textTertiary },
  dotFirst: { backgroundColor: Colors.signal },
  hopWords: { flex: 1 },
  city: { fontSize: 15, color: Colors.text },
});
