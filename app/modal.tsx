import { useFocusEffect } from '@react-navigation/native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { TrackRow } from '@/components/discovery/track-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { buildSpotifySearchUrl, type DiscoveryTrack } from '@/lib/discovery';
import { appendExportBatch, loadLikedTracks, saveLikedTracks } from '@/lib/discovery-storage';

// react-native-web's Alert.alert is a no-op (confirmed against the installed
// react-native-web@0.21 source — `static alert() {}`), so a Cancel/confirm
// button pair there never fires either callback. window.confirm is a real,
// blocking browser dialog available in any DOM environment; wrapping both
// paths in a promise keeps the caller platform-agnostic.
function confirmDialog(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Confirm', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function buildExportText(selected: DiscoveryTrack[]): string {
  const lines = [`My liked tracks (${selected.length})`, ''];
  selected.forEach((t, i) => {
    lines.push(`${i + 1}. "${t.trackName}" — ${t.artistName}`);
    if (t.trackViewUrl) lines.push(`   Apple Music: ${t.trackViewUrl}`);
    lines.push(`   Spotify: ${buildSpotifySearchUrl(t.artistName, t.trackName)}`);
    lines.push('');
  });
  return lines.join('\n').trim();
}

export default function LikedTracksScreen() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [tracks, setTracks] = useState<DiscoveryTrack[]>([]);
  const [playingId, setPlayingId] = useState<number | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  // Holds the tracks a bulk export was attempted for, between showing the
  // manual-copy fallback (when Share.share isn't available) and the archive
  // confirm that follows it once the fallback is dismissed.
  const pendingArchiveRef = useRef<DiscoveryTrack[] | null>(null);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  // Reload every time this screen gains focus, so a track liked after it was
  // last opened still shows up on return — mirrors the Profile tab's pattern.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const liked = await loadLikedTracks();
        if (cancelled) return;
        setTracks(liked);
        setLoaded(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  function togglePlay(track: DiscoveryTrack) {
    if (playingId === track.id) {
      if (status.playing) {
        player.pause();
      } else {
        player.play();
      }
      return;
    }
    player.replace(track.previewUrl);
    player.play();
    setPlayingId(track.id);
  }

  function stopIfPlaying(ids: Set<number>) {
    if (playingId !== null && ids.has(playingId)) {
      player.pause();
      setPlayingId(null);
    }
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function handleLongPressRow(track: DiscoveryTrack) {
    if (selectionMode) return;
    setSelectionMode(true);
    setSelectedIds(new Set([track.id]));
  }

  function toggleSelected(track: DiscoveryTrack) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(track.id)) next.delete(track.id);
      else next.add(track.id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }

  // ---------- Single-track delete (swipe, outside selection mode) ----------

  async function handleRequestDelete(track: DiscoveryTrack, closeRow: () => void) {
    const confirmed = await confirmDialog(
      'Remove from liked tracks?',
      `"${track.trackName}" will be removed.`
    );
    if (confirmed) {
      stopIfPlaying(new Set([track.id]));
      const next = tracks.filter((t) => t.id !== track.id);
      setTracks(next);
      await saveLikedTracks(next);
    } else {
      closeRow();
    }
  }

  // ---------- Bulk actions (selection mode) ----------

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    const confirmed = await confirmDialog(
      'Delete tracks?',
      `Delete ${pluralize(selectedIds.size, 'track')}?`
    );
    if (!confirmed) return;
    stopIfPlaying(selectedIds);
    const next = tracks.filter((t) => !selectedIds.has(t.id));
    setTracks(next);
    await saveLikedTracks(next);
    exitSelectionMode();
  }

  async function archiveAndClear(selected: DiscoveryTrack[]) {
    const confirmed = await confirmDialog(
      'Move to export history?',
      `Move ${pluralize(selected.length, 'track')} to export history and clear ${
        selected.length === 1 ? 'it' : 'them'
      } from your liked list?`
    );
    if (!confirmed) return;
    const ids = new Set(selected.map((t) => t.id));
    stopIfPlaying(ids);
    const next = tracks.filter((t) => !ids.has(t.id));
    setTracks(next);
    await saveLikedTracks(next);
    await appendExportBatch({ id: String(Date.now()), exportedAt: Date.now(), tracks: selected });
    exitSelectionMode();
  }

  function dismissFallback() {
    setFallbackText(null);
    const pending = pendingArchiveRef.current;
    pendingArchiveRef.current = null;
    if (pending) archiveAndClear(pending);
  }

  async function handleBulkExport() {
    const selected = tracks.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) return;
    const text = buildExportText(selected);
    let shared = true;
    try {
      await Share.share({ message: text });
    } catch {
      // Share.share isn't supported (common on desktop web without the Web
      // Share API) or was cancelled — either way, fall back to a view the
      // user can manually select-and-copy from, no clipboard dependency needed.
      shared = false;
    }
    if (shared) {
      await archiveAndClear(selected);
    } else {
      pendingArchiveRef.current = selected;
      setFallbackText(text);
    }
  }

  if (!loaded) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const newestFirst = [...tracks].reverse();

  return (
    <>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <ThemedView style={styles.container}>
          {selectionMode ? (
            <ThemedView style={styles.toolbar}>
              <ThemedText type="defaultSemiBold">{selectedIds.size} selected</ThemedText>
              <ThemedView style={styles.toolbarActions} lightColor="transparent" darkColor="transparent">
                <TouchableOpacity onPress={handleBulkExport} disabled={selectedIds.size === 0}>
                  <ThemedText type="link">Export</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleBulkDelete} disabled={selectedIds.size === 0}>
                  <ThemedText type="link" style={styles.deleteLink}>
                    Delete
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={exitSelectionMode}>
                  <ThemedText type="link">Cancel</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            </ThemedView>
          ) : (
            <TouchableOpacity onPress={() => router.push('/export-history')} style={styles.historyLink}>
              <ThemedText type="link">Export History</ThemedText>
            </TouchableOpacity>
          )}

          {newestFirst.length === 0 ? (
            <ThemedText>No liked tracks yet — swipe right on something you like.</ThemedText>
          ) : (
            newestFirst.map((track) => {
              const isPlayingThis = playingId === track.id && status.playing;
              const isSelected = selectedIds.has(track.id);
              const row = (
                <TouchableOpacity
                  activeOpacity={selectionMode ? 0.7 : 1}
                  onPress={selectionMode ? () => toggleSelected(track) : undefined}
                  onLongPress={() => handleLongPressRow(track)}
                  delayLongPress={350}>
                  <ThemedView style={[styles.rowWrapper, isSelected && styles.rowSelected]}>
                    {selectionMode && (
                      <ThemedView style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                        {isSelected && <ThemedText style={styles.checkboxMark}>✓</ThemedText>}
                      </ThemedView>
                    )}
                    <ThemedView style={styles.rowContent} lightColor="transparent" darkColor="transparent">
                      <TrackRow
                        track={track}
                        isPlaying={isPlayingThis}
                        onTogglePlay={() => togglePlay(track)}
                        disabled={selectionMode}
                      />
                    </ThemedView>
                  </ThemedView>
                </TouchableOpacity>
              );
              return (
                <Swipeable
                  key={track.id}
                  enabled={!selectionMode}
                  overshootRight={false}
                  renderRightActions={(_progress, _translation, swipeableMethods) => (
                    <TouchableOpacity
                      onPress={() => handleRequestDelete(track, swipeableMethods.close)}
                      style={styles.deleteAction}>
                      <ThemedText style={styles.deleteActionText}>Delete</ThemedText>
                    </TouchableOpacity>
                  )}>
                  {row}
                </Swipeable>
              );
            })
          )}
        </ThemedView>
      </ScrollView>

      <Modal visible={fallbackText !== null} transparent animationType="fade" onRequestClose={dismissFallback}>
        <Pressable style={styles.backdrop} onPress={dismissFallback}>
          <Pressable style={styles.fallbackSheet} onPress={(e) => e.stopPropagation()}>
            <ThemedText type="defaultSemiBold" style={styles.fallbackTitle}>
              Sharing isn&apos;t available here — select and copy instead:
            </ThemedText>
            <ScrollView style={styles.fallbackScroll}>
              <ThemedText selectable style={styles.fallbackText}>
                {fallbackText}
              </ThemedText>
            </ScrollView>
            <TouchableOpacity onPress={dismissFallback} activeOpacity={0.7}>
              <ThemedView style={styles.fallbackDone} lightColor="#2a2a2a" darkColor="#2a2a2a">
                <ThemedText style={styles.fallbackDoneText}>Done</ThemedText>
              </ThemedView>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: 20,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyLink: {
    alignSelf: 'flex-start',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toolbarActions: {
    flexDirection: 'row',
    gap: 16,
  },
  deleteLink: {
    color: '#c0392b',
  },
  rowWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowSelected: {
    backgroundColor: 'rgba(74, 158, 255, 0.12)',
  },
  rowContent: {
    flex: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#888',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4a9eff',
    borderColor: '#4a9eff',
  },
  checkboxMark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  deleteAction: {
    backgroundColor: '#c0392b', // matches errorText's red in app/(tabs)/index.tsx
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionText: {
    color: '#fff',
    fontWeight: '600',
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 24,
  },
  fallbackSheet: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    gap: 16,
    maxHeight: '80%',
    width: '100%',
  },
  fallbackTitle: {
    color: '#fff',
  },
  fallbackScroll: {
    maxHeight: 300,
  },
  fallbackText: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 20,
  },
  fallbackDone: {
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  fallbackDoneText: {
    color: '#fff',
    fontWeight: '600',
  },
});
