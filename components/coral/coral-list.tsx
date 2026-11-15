import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DarkColors, Spacing } from '@/constants/theme';
import { mixFor } from '@/lib/coral';
import type { CoralLink, CoralSong } from '@/lib/coral-types';

import { CoralButton } from './coral-controls';
import { songLabel } from './coral-rules';

export function CoralList({ links, blindIds, positions, onAdjust, onOpen, onPlay }: {
  links: CoralLink[]; blindIds: Set<number>; positions: Record<string, number>;
  onAdjust: (link: CoralLink, direction: number) => void; onOpen: (id: string) => void; onPlay: (song: CoralSong) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.list}>
      {links.map((link) => {
        const a = songLabel(link.a, blindIds.has(link.a.trackId));
        const b = songLabel(link.b, blindIds.has(link.b.trackId));
        const t = positions[link.id] ?? 0;
        const mix = Math.round(mixFor(link.type, t) * 100);
        const value = `${100 - mix}% first song, ${mix}% second song`;
        return <View key={link.id} style={styles.branch}>
          <View accessible accessibilityRole="adjustable" accessibilityLabel={`${a} to ${b}. ${link.type === 'fade' ? 'Fade' : 'Cut'} branch`}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(t * 100), text: value }}
            accessibilityHint="Adjust to move a quarter of the branch. Activate to edit it."
            accessibilityActions={[{ name: 'increment', label: 'Toward second song' }, { name: 'decrement', label: 'Toward first song' }, { name: 'activate', label: 'Edit branch' }]}
            onAccessibilityAction={(event) => {
              const action = event.nativeEvent.actionName;
              if (action === 'increment' || action === 'decrement') onAdjust(link, action === 'increment' ? 1 : -1);
              else if (action === 'activate') onOpen(link.id);
            }} style={styles.names}>
            <ThemedText style={styles.name}>{a}</ThemedText>
            <View style={styles.line}><View style={[styles.half, { backgroundColor: link.a.color }]} /><View style={[styles.half, { backgroundColor: link.b.color }]} /></View>
            <ThemedText style={styles.name}>{b}</ThemedText>
            <ThemedText style={styles.detail}>{link.type === 'fade' ? 'Fade' : 'Cut'} · {value}</ThemedText>
          </View>
          <View style={styles.buttons}>
            <CoralButton dark label={`Move toward ${a}`} disabled={t <= 0} onPress={() => onAdjust(link, -1)}>Toward first</CoralButton>
            <CoralButton dark label={`Move toward ${b}`} disabled={t >= 1} onPress={() => onAdjust(link, 1)}>Toward second</CoralButton>
            <CoralButton dark label={`Play ${a}`} onPress={() => onPlay(link.a)}>Play first</CoralButton>
            <CoralButton dark label={`Play ${b}`} onPress={() => onPlay(link.b)}>Play second</CoralButton>
            <CoralButton dark label={`Edit branch from ${a} to ${b}`} onPress={() => onOpen(link.id)}>Edit branch</CoralButton>
          </View>
        </View>;
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.lg },
  branch: { backgroundColor: '#092d40', borderRadius: 24, padding: Spacing.lg, gap: Spacing.md },
  names: { gap: Spacing.sm },
  name: { fontSize: 18, color: DarkColors.text, fontWeight: '600' },
  detail: { fontSize: 14, color: '#c1d2d5' },
  line: { flexDirection: 'row', width: 64, height: 4, borderRadius: 2, overflow: 'hidden' },
  half: { flex: 1 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});
