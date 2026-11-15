import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet, sheetStyles } from '@/components/ui/sheet';
import { MAX_START, type CoralLink, type CoralSong, type LinkType } from '@/lib/coral-types';

import { CoralButton, LinkTypeControl, coralSheetStyles as styles } from './coral-controls';
import { songLabel, type Bloom } from './coral-rules';

export function CoralBranchSheet({ link, blindIds, bloom, onType, onStart, onRemove, onPlay, onClose }: {
  link: CoralLink; blindIds: Set<number>; bloom: Bloom;
  onType: (type: LinkType) => Promise<void>; onStart: (end: 'a' | 'b', seconds: number) => Promise<void>;
  onRemove: () => Promise<void>; onPlay: (song: CoralSong) => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await action(); }
    catch { setError('Could not save that change. Try again.'); }
    finally { setBusy(false); }
  }

  return (
    <BottomSheet visible onClose={onClose} maxHeight="90%">
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.row}>
          <ThemedText style={styles.title} accessibilityRole="header">Your branch</ThemedText>
          <CoralButton onPress={onClose}>Close</CoralButton>
        </View>
        <LinkTypeControl value={link.type} disabled={busy} onChange={(type) => void save(() => onType(type))} />
        <ThemedText style={styles.text}>Where each song comes in</ThemedText>
        {(['a', 'b'] as const).map((end) => {
          const song = link[end];
          const name = songLabel(song, blindIds.has(song.trackId));
          const seconds = end === 'a' ? link.startA : link.startB;
          return <View key={end} style={sheetStyles.card}>
            <ThemedText style={styles.text}>{name}</ThemedText>
            <ThemedText style={styles.secondary}>Starts {seconds} seconds into the clip</ThemedText>
            <View style={styles.row}>
              <CoralButton disabled={busy || seconds <= 0} label={`Start ${name} one second earlier`} onPress={() => void save(() => onStart(end, seconds - 1))}>Earlier</CoralButton>
              <CoralButton disabled={busy || seconds >= MAX_START} label={`Start ${name} one second later`} onPress={() => void save(() => onStart(end, seconds + 1))}>Later</CoralButton>
              <CoralButton disabled={!song.previewUrl} label={`Play ${name}`} onPress={() => onPlay(song)}>Play song</CoralButton>
            </View>
          </View>;
        })}
        {!blindIds.has(link.a.trackId) && !blindIds.has(link.b.trackId) && bloom !== 'normal' && (
          <ThemedText style={styles.secondary}>{bloom === 'bloom' ? 'Close tempos grow bright buds, including at half or double time.' : 'Different tempos make this branch paler.'}</ThemedText>
        )}
        {!!error && <ThemedText style={styles.error} accessibilityLiveRegion="polite">{error}</ThemedText>}
        <CoralButton disabled={busy} onPress={() => void save(async () => { await onRemove(); onClose(); })}>Remove branch</CoralButton>
      </ScrollView>
    </BottomSheet>
  );
}
