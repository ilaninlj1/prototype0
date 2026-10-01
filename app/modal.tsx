import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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
    View,
} from 'react-native';

import { CreditLine } from '@/components/credits';
import { CoverCell } from '@/components/discovery/cover-cell';
import { deleteLikes, onLikeChange } from '@/components/like-button';
import { MiniPlayer } from '@/components/mini-player';
import { NoteSheet } from '@/components/note-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useListenersNow } from '@/hooks/use-listeners-now';
import { usePlayback } from '@/hooks/use-playback';
import { buildSpotifySearchUrl, filterByGenre, likedGenres, summarizeFinds, type DiscoveryTrack } from '@/lib/discovery';
import { appendExportBatch, loadLikedTracks, loadRecentlyDeleted, saveLikedTracks, setLikedNote } from '@/lib/discovery-storage';
import { setNote } from '@/lib/saved-songs';

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
  const [deletedCount, setDeletedCount] = useState(0);
  const [noteTrack, setNoteTrack] = useState<DiscoveryTrack | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  // Kept so the player stays up if you take the heart off the song that's
  // playing — tap the heart again to undo.
  const [playingTrack, setPlayingTrack] = useState<DiscoveryTrack | null>(null);

  const [genre, setGenre] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  // Holds the tracks a bulk export was attempted for, between showing the
  // manual-copy fallback (when Share.share isn't available) and the archive
  // confirm that follows it once the fallback is dismissed.
  const pendingArchiveRef = useRef<DiscoveryTrack[] | null>(null);

  // Shared across every screen that plays audio — see hooks/use-playback.tsx —
  // so starting a preview here always stops one already playing on the swipe
  // screen or export history, and vice versa, since it's the same player.
  const { player, status } = usePlayback();

  const listenersNow = useListenersNow(tracks.map((t) => t.artistName));

  const reload = useCallback(async () => {
    const [liked, deleted] = await Promise.all([loadLikedTracks(), loadRecentlyDeleted()]);
    setTracks(liked);
    setDeletedCount(deleted.length);
    setLoaded(true);
  }, []);

  // Reload every time this screen gains focus, so a track liked (or restored)
  // after it was last opened still shows up on return, and whenever a heart on
  // this screen's player changes.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );
  useEffect(() => onLikeChange(() => reload()), [reload]);

  // Leaving this screen pauses playback rather than leaving it running in the
  // background, and clears the local "which row is playing" state so a row
  // doesn't keep showing a pause icon for a track that's no longer playing.
  useFocusEffect(
    useCallback(() => {
      return () => {
        player.pause();
        setPlayingId(null);
      };
    }, [player])
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
    setPlayingTrack(track);
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

  // ---------- Bulk actions (selection mode) ----------

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    const confirmed = await confirmDialog(
      `Delete ${pluralize(selectedIds.size, 'song')}?`,
      'They go to Recently deleted, so you can put them back.'
    );
    if (!confirmed) return;
    stopIfPlaying(selectedIds);
    const ids = [...selectedIds];
    setTracks((prev) => prev.filter((t) => !selectedIds.has(t.id)));
    exitSelectionMode();
    await deleteLikes(ids);
  }

  function selectAll(visible: DiscoveryTrack[]) {
    setSelectedIds(new Set(visible.map((t) => t.id)));
  }

  async function saveNote(track: DiscoveryTrack, text: string) {
    setTracks((prev) => setNote(prev, track.id, text));
    await setLikedNote(track.id, text);
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
        <ActivityIndicator color={Colors.accent} />
      </ThemedView>
    );
  }

  const genres = likedGenres(tracks);
  const savedPlaying = tracks.find((t) => t.id === playingId) ?? null;
  const nowPlaying = savedPlaying ?? (playingTrack?.id === playingId ? playingTrack : null);
  const newestFirst = filterByGenre([...tracks].reverse(), genre && genres.includes(genre) ? genre : null);
  const { best, calledIt } = summarizeFinds(
    tracks.map((t) => ({ artistName: t.artistName, found: t.artistListeners, now: listenersNow[t.artistName] }))
  );

  return (
    <>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <ThemedView style={styles.container}>
          {selectionMode ? (
            <ThemedView style={styles.toolbar} backgroundColor="transparent">
              <ThemedText type="defaultSemiBold">{selectedIds.size} selected</ThemedText>
              <ThemedView style={styles.toolbarActions} backgroundColor="transparent">
                <TouchableOpacity onPress={() => selectAll(newestFirst)}>
                  <ThemedText type="link">Select all</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleBulkExport} disabled={selectedIds.size === 0}>
                  <ThemedText type="link">Export</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleBulkDelete} disabled={selectedIds.size === 0}>
                  <ThemedText type="link" style={styles.deleteLink}>
                    Delete
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={exitSelectionMode}>
                  <ThemedText type="label" style={styles.cancelLink}>
                    Cancel
                  </ThemedText>
                </TouchableOpacity>
              </ThemedView>
            </ThemedView>
          ) : (
            <ThemedView style={styles.links} backgroundColor="transparent">
              <TouchableOpacity onPress={() => router.push('/export-history')}>
                <ThemedText type="link">Export History</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/recently-deleted')}>
                <ThemedText type="link">
                  Recently deleted{deletedCount > 0 ? ` · ${deletedCount}` : ''}
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>
          )}

          {best && (
            <ThemedView style={styles.summary} backgroundColor={Colors.surface}>
              <ThemedText type="defaultSemiBold">
                Best call: {best.artistName} ↑ {best.pct}%
              </ThemedText>
              <ThemedText type="caption">
                {calledIt > 0
                  ? `You called ${calledIt} — they've at least doubled since you found them.`
                  : 'Nothing has doubled yet. Keep digging.'}
              </ThemedText>
            </ThemedView>
          )}

          <Pressable style={styles.lookup} onPress={() => router.push('/search')} accessibilityRole="search">
            <Ionicons name="search" size={18} color={Colors.textTertiary} />
            <ThemedText style={styles.lookupText}>Look up any song, artist or album</ThemedText>
          </Pressable>

          {genres.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {[null, ...genres].map((g) => {
                const on = g === genre || (g === null && genre === null);
                return (
                  <TouchableOpacity key={g ?? 'all'} onPress={() => setGenre(g)} activeOpacity={0.7}>
                    <ThemedView style={styles.chip} backgroundColor={on ? Colors.accent : Colors.surfaceElevated}>
                      <ThemedText type="label" style={{ color: on ? Colors.accentText : Colors.textSecondary }}>
                        {g ?? 'All'}
                      </ThemedText>
                    </ThemedView>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {newestFirst.length === 0 ? (
            <ThemedView style={styles.empty} backgroundColor="transparent">
              <ThemedText style={styles.emptyText}>Nothing saved yet. Double-tap a song on Home to save it.</ThemedText>
              {deletedCount > 0 && (
                <TouchableOpacity onPress={() => router.push('/recently-deleted')}>
                  <ThemedText type="link">
                    Deleted something by mistake? Get it back from Recently deleted
                  </ThemedText>
                </TouchableOpacity>
              )}
            </ThemedView>
          ) : (
            <View style={styles.grid}>
              {newestFirst.map((track) => (
                <CoverCell
                  key={track.id}
                  track={track}
                  listenersNow={listenersNow[track.artistName]}
                  playing={playingId === track.id && status.playing}
                  selecting={selectionMode}
                  selected={selectedIds.has(track.id)}
                  onPress={() => (selectionMode ? toggleSelected(track) : togglePlay(track))}
                  onLongPress={() => handleLongPressRow(track)}
                />
              ))}
            </View>
          )}
          <CreditLine />
        </ThemedView>
      </ScrollView>

      {nowPlaying && (
        <View style={styles.mini}>
          <MiniPlayer
            track={nowPlaying}
            playing={status.playing}
            progress={status.duration ? status.currentTime / status.duration : 0}
            onToggle={() => togglePlay(nowPlaying)}
            onEditNote={savedPlaying ? () => setNoteTrack(savedPlaying) : undefined}
          />
        </View>
      )}

      <NoteSheet track={noteTrack} onSave={saveNote} onClose={() => setNoteTrack(null)} />

      <Modal visible={fallbackText !== null} transparent animationType="fade" onRequestClose={dismissFallback}>
        <Pressable style={styles.backdrop} onPress={dismissFallback}>
          <Pressable style={styles.fallbackSheet} onPress={(e) => e.stopPropagation()}>
            <ThemedText type="defaultSemiBold">
              Sharing isn&apos;t available here — select and copy instead:
            </ThemedText>
            <ScrollView style={styles.fallbackScroll}>
              <ThemedText selectable type="caption" style={styles.fallbackText}>
                {fallbackText}
              </ThemedText>
            </ScrollView>
            <TouchableOpacity onPress={dismissFallback} activeOpacity={0.7}>
              <ThemedView style={styles.fallbackDone} backgroundColor={Colors.surfaceElevated}>
                <ThemedText type="label">Done</ThemedText>
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
    paddingBottom: 150,
  },
  container: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
  },
  summary: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 2,
  },
  chips: {
    gap: Spacing.sm,
  },
  chip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
  },
  lookup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  lookupText: {
    color: Colors.textTertiary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  mini: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Spacing.xl,
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
  },
  empty: {
    gap: Spacing.md,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toolbarActions: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  deleteLink: {
    color: Colors.destructive,
  },
  cancelLink: {
    color: Colors.textSecondary,
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: Spacing.xl,
  },
  fallbackSheet: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.lg,
    maxHeight: '80%',
    width: '100%',
  },
  fallbackScroll: {
    maxHeight: 300,
  },
  fallbackText: {
    lineHeight: 20,
  },
  fallbackDone: {
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
});
