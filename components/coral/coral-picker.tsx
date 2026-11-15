import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/sheet';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { canLink } from '@/lib/coral';
import { MAX_LINKS, type CoralSong, type CoralState, type LinkType } from '@/lib/coral-types';

import { CoralButton, LinkTypeControl, coralSheetStyles as styles } from './coral-controls';
import { songLabel } from './coral-rules';

const reasons = { same: 'Choose two different songs.', linked: 'These songs already share a branch.', full: `Your coral has ${MAX_LINKS} branches. Remove one to make room.`, ok: '' };

/** Mounted afresh for each opening, so a previous pair never slips into a new branch. */
export function CoralPicker({ songs, state, blindIds, initialId, notice, onGrow, onClose }: {
  songs: CoralSong[]; state: CoralState; blindIds: Set<number>; initialId?: number; notice?: string;
  onGrow: (a: CoralSong, b: CoralSong, type: LinkType) => Promise<void>; onClose: () => void;
}) {
  const initial = songs.find((song) => song.trackId === initialId) ?? null;
  const [a, setA] = useState<CoralSong | null>(initial);
  const [b, setB] = useState<CoralSong | null>(null);
  const [end, setEnd] = useState<'a' | 'b'>(initial ? 'b' : 'a');
  const [type, setType] = useState<LinkType>('fade');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reason = a && b ? reasons[canLink(state, a, b)] : state.links.length >= MAX_LINKS ? reasons.full : '';
  const shown = useMemo(() => songs.filter((song) => songLabel(song, blindIds.has(song.trackId)).toLowerCase().includes(query.trim().toLowerCase())), [songs, query, blindIds]);

  async function grow() {
    if (!a || !b || busy || reason) return;
    setBusy(true);
    setError('');
    try { await onGrow(a, b, type); onClose(); }
    catch { setError('Could not save this branch. Try again.'); }
    finally { setBusy(false); }
  }

  return (
    <BottomSheet visible onClose={onClose} maxHeight="92%">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <View style={styles.row}>
          <ThemedText style={styles.title} accessibilityRole="header">Grow a branch</ThemedText>
          <CoralButton onPress={onClose}>Close</CoralButton>
        </View>
        {!!notice && <ThemedText style={styles.secondary}>{notice}</ThemedText>}
        {songs.length < 2 && <ThemedText style={styles.text}>Save two songs in your Library to join them here.</ThemedText>}
        {(['a', 'b'] as const).map((side) => {
          const song = side === 'a' ? a : b;
          return <Pressable key={side} onPress={() => setEnd(side)} accessibilityRole="button" accessibilityState={{ selected: end === side }}
            style={[local.choice, end === side && local.chosen]}>
            <ThemedText style={styles.secondary}>{side === 'a' ? 'First song' : 'Second song'}</ThemedText>
            <ThemedText style={styles.text}>{song ? songLabel(song, blindIds.has(song.trackId)) : 'Choose a song'}</ThemedText>
          </Pressable>;
        })}
        <LinkTypeControl value={type} onChange={setType} disabled={busy} />
        {!!(reason || error) && <ThemedText accessibilityLiveRegion="polite" style={styles.error}>{reason || error}</ThemedText>}
        <CoralButton primary disabled={!a || !b || !!reason || busy} onPress={() => void grow()}>{busy ? 'Growing…' : 'Grow this branch'}</CoralButton>
        <TextInput accessibilityLabel="Search saved songs" placeholder="Search saved songs" placeholderTextColor={Colors.textSecondary}
          value={query} onChangeText={setQuery} style={local.search} autoCorrect={false} />
        <ThemedText style={styles.secondary}>Choose the {end === 'a' ? 'first' : 'second'} song</ThemedText>
        {shown.map((song) => {
          const blind = blindIds.has(song.trackId);
          const selected = (end === 'a' ? a : b)?.trackId === song.trackId;
          return <Pressable key={song.trackId} disabled={busy || !song.previewUrl} accessibilityRole="button"
            accessibilityState={{ selected, disabled: busy || !song.previewUrl }}
            onPress={() => { if (end === 'a') { setA(song); setEnd('b'); } else setB(song); setError(''); }}
            style={[local.song, selected && local.chosen]}>
            <View style={[local.dot, { backgroundColor: song.color }]} />
            <View style={local.words}>
              <ThemedText style={styles.text}>{songLabel(song, blind)}</ThemedText>
              {blind && <ThemedText style={styles.secondary}>Reveal it on Home first.</ThemedText>}
              {!song.previewUrl && <ThemedText style={styles.secondary}>No clip available.</ThemedText>}
            </View>
          </Pressable>;
        })}
        {!shown.length && songs.length > 0 && <ThemedText style={styles.text}>No saved songs match.</ThemedText>}
      </ScrollView>
    </BottomSheet>
  );
}

const local = StyleSheet.create({
  choice: { padding: Spacing.md, borderWidth: 2, borderColor: Colors.surface, borderRadius: 18, gap: 4 },
  chosen: { borderColor: Colors.text, backgroundColor: Colors.surface },
  search: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, backgroundColor: Colors.surface, color: Colors.text, fontFamily: Fonts.sans, fontSize: 16 },
  song: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 2, borderColor: 'transparent', padding: Spacing.sm, borderRadius: 16, minHeight: 56 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  words: { flex: 1, gap: 4 },
});
