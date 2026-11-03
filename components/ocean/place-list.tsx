import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet, SheetHeader } from '@/components/ui/sheet';
import { Colors, Spacing } from '@/constants/theme';
import type { DiscoveryTrack } from '@/lib/discovery';
import { placeLabel, type Place } from '@/lib/ocean-map';
import type { Creature } from '@/lib/ocean-person';

/** Everyone of yours in a place, as a plain list: for more than can swim at once, and for a screen reader. */
export function PlaceList({
  place,
  creatures,
  trackOf,
  isBlind,
  onPick,
  onClose,
}: {
  place: Place | null;
  creatures: Creature[];
  trackOf: (id: number) => DiscoveryTrack | null;
  isBlind: (id: number) => boolean;
  onPick: (c: Creature) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={!!place} onClose={onClose}>
      {place && (
        <>
          <SheetHeader title={placeLabel(place)} onDone={onClose} />
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {creatures.length === 0 && <ThemedText style={styles.empty}>None of your songs live here yet.</ThemedText>}
            {creatures.map((c) => {
              const blind = isBlind(c.trackId);
              const t = trackOf(c.trackId);
              return (
                <Pressable key={c.trackId} style={styles.row} onPress={() => onPick(c)} accessibilityRole="button">
                  {blind || !t?.artworkUrl100 ? <View style={[styles.cover, { backgroundColor: c.color }]} /> : <Image source={{ uri: t.artworkUrl100 }} style={styles.cover} accessibilityIgnoresInvertColors />}
                  <View style={styles.names}>
                    <ThemedText style={styles.title} numberOfLines={1}>
                      {blind ? 'Still blind' : (t?.trackName ?? 'A song you saved')}
                    </ThemedText>
                    <ThemedText style={styles.artist} numberOfLines={1}>
                      {blind ? 'Reveal it on Home first' : (t?.artistName ?? c.artist)}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl },
  empty: { fontSize: 15, lineHeight: 21, color: Colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 56 },
  cover: { width: 48, height: 48, borderRadius: 12 },
  names: { flex: 1 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: Colors.text },
  artist: { fontSize: 13, lineHeight: 18, color: Colors.textSecondary },
});
