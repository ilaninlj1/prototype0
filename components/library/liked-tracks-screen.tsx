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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreditLine } from '@/components/credits';
import { CoverCell } from '@/components/discovery/cover-cell';
import { deleteLikes, onLikeChange } from '@/components/like-button';
import { MiniPlayer } from '@/components/mini-player';
import { NoteSheet } from '@/components/note-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts, Radius, Spacing, TapTarget, Typography, Ui } from '@/constants/theme';
import { useCalledShots } from '@/hooks/use-called-shots';
import { useListenersNow } from '@/hooks/use-listeners-now';
import { usePlayback } from '@/hooks/use-playback';
import { useScrollChrome } from '@/hooks/use-scroll-chrome';
import { summarizeCalls } from '@/lib/called-shots';
import { buildSpotifySearchUrl, likedGenres, summarizeFinds, type DiscoveryTrack } from '@/lib/discovery';
import { appendExportBatch, loadLikedTracks, loadRecentlyDeleted, saveLikedTracks, setLikedNote } from '@/lib/discovery-storage';
import { libraryView } from '@/lib/library';
import { setNote } from '@/lib/saved-songs';
import { requestSteer, type SteerRequest } from '@/lib/steer-request';

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

/** A round grey icon button for the top bar. */
function BarIcon({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.barIcon} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      <Ionicons name={icon} size={20} color={Colors.text} />
    </Pressable>
  );
}

/**
 * Everything you've saved: the Library tab (app/(tabs)/library.tsx), once the
 * Liked Tracks modal. A top bar with the search slides away while you scroll
 * down the covers and comes back on a short scroll up (hooks/use-scroll-chrome.ts).
 */
export function LikedTracksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [tracks, setTracks] = useState<DiscoveryTrack[]>([]);
  const [deletedCount, setDeletedCount] = useState(0);
  const [noteTrack, setNoteTrack] = useState<DiscoveryTrack | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  // Kept so the player stays up if you take the heart off the song that's
  // playing — tap the heart again to undo.
  const [playingTrack, setPlayingTrack] = useState<DiscoveryTrack | null>(null);
  const [playerHeight, setPlayerHeight] = useState(0);

  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(false);
  const [genre, setGenre] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  // Holds the tracks a bulk export was attempted for, between showing the
  // manual-copy fallback (when Share.share isn't available) and the archive
  // confirm that follows it once the fallback is dismissed.
  const pendingArchiveRef = useRef<DiscoveryTrack[] | null>(null);
  // The bar's height pads the list, so the bar sliding away never moves a cover.
  const [barHeight, setBarHeight] = useState(insets.top + 128);

  // The bar stays put while you type, pick songs, or a sheet is up.
  const chrome = useScrollChrome({ pinned: typing || selectionMode || noteTrack !== null || fallbackText !== null });

  // Shared across every screen that plays audio — see hooks/use-playback.tsx —
  // so starting a preview here always stops one already playing on the swipe
  // screen or export history, and vice versa, since it's the same player.
  const { player, status } = usePlayback();

  const { calls, loaded: callsLoaded } = useCalledShots();
  const listenersNow = useListenersNow([...tracks.map((t) => t.artistName), ...calls.map((c) => c.artistName)]);

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

  async function shareCall(message: string) {
    try {
      await Share.share({ message });
    } catch {
      pendingArchiveRef.current = null;
      setFallbackText(message);
    }
  }

  if (!loaded || !callsLoaded) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={Colors.accent} />
      </ThemedView>
    );
  }

  const empty = tracks.length === 0;
  const genres = likedGenres(tracks);
  const savedPlaying = tracks.find((t) => t.id === playingId) ?? null;
  function steerHome(request: SteerRequest) {
    requestSteer(request);
    router.navigate('/');
  }
  function lookUp() {
    const q = query.trim();
    router.push(q ? { pathname: '/search', params: { q } } : '/search');
  }
  const nowPlaying = savedPlaying ?? (playingTrack?.id === playingId ? playingTrack : null);
  const shown = libraryView(tracks, { query, genre });
  const { best } = summarizeFinds(
    tracks.map((t) => ({ artistName: t.artistName, found: t.artistListeners, now: listenersNow[t.artistName] }))
  );
  const callSummary = summarizeCalls(calls, listenersNow);
  const callsByTrack = new Map(calls.map((c) => [c.trackId, c]));
  const today = Date.now();

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        {...chrome.scrollProps}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: barHeight + Spacing.sm, paddingBottom: playerHeight + Spacing.xl + Spacing.lg }]}>
        {empty ? (
          <View style={styles.empty}>
            <ThemedText style={styles.emptyTitle}>Nothing saved yet.</ThemedText>
            <ThemedText style={styles.emptyText}>Double-tap a song you love to keep it here.</ThemedText>
            <Pressable onPress={() => router.navigate('/')} style={styles.primary} accessibilityRole="button">
              <Ionicons name="headset" size={18} color={Colors.accentText} />
              <ThemedText style={styles.primaryText}>Start listening</ThemedText>
            </Pressable>
            {deletedCount > 0 && (
              <TouchableOpacity onPress={() => router.push('/recently-deleted')} style={Ui.textButton}>
                <ThemedText style={styles.link}>Deleted something by mistake? Recently deleted · {deletedCount}</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {(best || calls.length > 0) && (
              <View style={styles.summary}>
                {best && (
                  <ThemedText style={styles.summaryTitle}>
                    Best find: {best.artistName} ↑ {best.pct}% since you found it
                  </ThemedText>
                )}
                <ThemedText style={styles.summaryLine}>
                  Your calls: {callSummary.hit} hit, {callSummary.waiting} waiting
                </ThemedText>
              </View>
            )}

            {genres.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsRow}>
                {[null, ...genres].map((g) => {
                  const on = g === genre || (g === null && (genre === null || !genres.includes(genre)));
                  return (
                    <Pressable
                      key={g ?? 'all'}
                      onPress={() => setGenre(g)}
                      style={[styles.chip, on && styles.chipOn]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}>
                      <ThemedText style={[styles.chipText, on && styles.chipTextOn]}>{g ?? 'All'}</ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {shown.length > 0 && (
              <ThemedText style={styles.hint}>
                {query.trim() ? `${shown.length} ${shown.length === 1 ? 'match' : 'matches'}` : pluralize(shown.length, 'song')}
                {selectionMode ? ' · tap covers to pick them' : ' · tap a cover to play it, hold to pick'}
              </ThemedText>
            )}

            {shown.length === 0 ? (
              <View style={styles.noMatch}>
                <ThemedText style={styles.emptyText}>No saved songs match “{query.trim()}”.</ThemedText>
                <Pressable onPress={lookUp} style={[Ui.outlineButton, styles.lookUp]} accessibilityRole="button">
                  <Ionicons name="search" size={16} color={Colors.text} />
                  <ThemedText style={Ui.label}>Search all music for “{query.trim()}”</ThemedText>
                </Pressable>
              </View>
            ) : (
              <View style={styles.grid}>
                {shown.map((track) => (
                  <CoverCell
                    key={track.id}
                    track={track}
                    listenersNow={listenersNow[track.artistName]}
                    today={today}
                    call={callsByTrack.get(track.id)}
                    onShare={shareCall}
                    playing={playingId === track.id && status.playing}
                    selecting={selectionMode}
                    selected={selectedIds.has(track.id)}
                    onPress={() => (selectionMode ? toggleSelected(track) : togglePlay(track))}
                    onLongPress={() => handleLongPressRow(track)}
                  />
                ))}
              </View>
            )}

            <View style={styles.links}>
              <TouchableOpacity onPress={() => router.push('/export-history')} style={Ui.textButton}>
                <ThemedText style={styles.link}>Export history</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/recently-deleted')} style={Ui.textButton}>
                <ThemedText style={styles.link}>Recently deleted{deletedCount > 0 ? ` · ${deletedCount}` : ''}</ThemedText>
              </TouchableOpacity>
            </View>
          </>
        )}
        <CreditLine />
      </Animated.ScrollView>

      {/* The top bar: over the list, sliding up under the status bar strip while you scroll down. */}
      <Animated.View
        style={[styles.bar, { paddingTop: insets.top + Spacing.sm }, chrome.barStyle]}
        onLayout={(e) => {
          chrome.onBarLayout(e);
          setBarHeight(e.nativeEvent.layout.height);
        }}>
        {selectionMode ? (
          <>
            <View style={styles.titleRow}>
              <ThemedText style={styles.selectedTitle}>{pluralize(selectedIds.size, 'song')} picked</ThemedText>
              <TouchableOpacity onPress={exitSelectionMode} style={Ui.textButton} accessibilityRole="button">
                <ThemedText style={styles.cancel}>Cancel</ThemedText>
              </TouchableOpacity>
            </View>
            <View style={styles.selectActions}>
              <Pressable onPress={() => selectAll(shown)} style={styles.pill} accessibilityRole="button">
                <ThemedText style={Ui.label}>Pick all</ThemedText>
              </Pressable>
              <Pressable onPress={handleBulkExport} disabled={selectedIds.size === 0} style={[styles.pill, selectedIds.size === 0 && styles.off]} accessibilityRole="button">
                <Ionicons name="share-outline" size={16} color={Colors.text} />
                <ThemedText style={Ui.label}>Export</ThemedText>
              </Pressable>
              <Pressable onPress={handleBulkDelete} disabled={selectedIds.size === 0} style={[styles.pill, selectedIds.size === 0 && styles.off]} accessibilityRole="button">
                <Ionicons name="trash-outline" size={16} color={Colors.destructive} />
                <ThemedText style={[Ui.label, styles.delete]}>Delete</ThemedText>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.titleRow}>
              <ThemedText type="title">Library</ThemedText>
              <View style={styles.barIcons}>
                <BarIcon icon="earth-outline" label="Look up any song, artist or album" onPress={lookUp} />
                {!empty && <BarIcon icon="checkmark-circle-outline" label="Pick songs to export or delete" onPress={() => setSelectionMode(true)} />}
              </View>
            </View>
            {!empty && (
              <View style={styles.search}>
                <Ionicons name="search" size={18} color={Colors.textSecondary} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  onFocus={() => setTyping(true)}
                  onBlur={() => setTyping(false)}
                  placeholder="Songs, artists or albums"
                  placeholderTextColor={Colors.textSecondary}
                  returnKeyType="search"
                  autoCorrect={false}
                  style={styles.searchInput}
                  accessibilityLabel="Search your Library"
                />
                {query.length > 0 && (
                  <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
                    <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
                  </Pressable>
                )}
              </View>
            )}
          </>
        )}
      </Animated.View>
      {/* The clock and battery always sit on white, even with the bar away. */}
      <View style={[styles.statusStrip, { height: insets.top }]} />

      {nowPlaying && (
        <View style={styles.mini} onLayout={(e) => setPlayerHeight(e.nativeEvent.layout.height)}>
          {savedPlaying && (
            <View style={styles.exploreActions}>
              {!!savedPlaying.artistId && (
                <TouchableOpacity
                  style={styles.exploreButton}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  onPress={() =>
                    steerHome({ kind: 'artist', strategy: { type: 'artist', artistId: savedPlaying.artistId, artistName: savedPlaying.artistName } })
                  }>
                  <ThemedText style={styles.exploreLabel}>More from this artist</ThemedText>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.exploreButton}
                activeOpacity={0.7}
                accessibilityRole="button"
                onPress={() => steerHome({ kind: 'sound', strategy: { type: 'genre', genre: savedPlaying.primaryGenreName } })}>
                <ThemedText style={styles.exploreLabel}>More like this sound</ThemedText>
              </TouchableOpacity>
            </View>
          )}
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
            <ThemedText type="defaultSemiBold">Sharing isn&apos;t available here. Select and copy instead:</ThemedText>
            <ScrollView style={styles.fallbackScroll}>
              <ThemedText selectable type="caption" style={styles.fallbackText}>
                {fallbackText}
              </ThemedText>
            </ScrollView>
            <Pressable onPress={dismissFallback} style={styles.primary} accessibilityRole="button">
              <ThemedText style={styles.primaryText}>Done</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, paddingHorizontal: Spacing.lg, gap: Spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  statusStrip: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: Colors.background },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  barIcons: { flexDirection: 'row', gap: Spacing.sm },
  barIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  selectedTitle: { ...Typography.subtitle, color: Colors.text },
  cancel: { ...Ui.label, color: Colors.textSecondary },
  selectActions: { flexDirection: 'row', gap: Spacing.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: Spacing.lg, borderRadius: 20, backgroundColor: Colors.surface },
  off: { opacity: 0.4 },
  delete: { color: Colors.destructive },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TapTarget,
    borderRadius: TapTarget / 2,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
  },
  searchInput: { flex: 1, minHeight: TapTarget, color: Colors.text, fontFamily: Fonts.sans, fontSize: 16 },
  summary: { borderRadius: 20, padding: Spacing.lg, gap: 4, backgroundColor: Colors.surface },
  summaryTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 16, lineHeight: 21, color: Colors.text },
  summaryLine: { fontSize: 14, lineHeight: 19, color: Colors.textSecondary },
  chipsRow: { marginHorizontal: -Spacing.lg, flexGrow: 0 },
  chips: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  chip: { minHeight: 36, paddingHorizontal: Spacing.lg, borderRadius: 18, justifyContent: 'center', backgroundColor: Colors.surface },
  chipOn: { backgroundColor: Colors.accent },
  chipText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.text },
  chipTextOn: { color: Colors.accentText },
  hint: { fontSize: 13, lineHeight: 17, color: Colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  noMatch: { gap: Spacing.md, alignItems: 'flex-start', paddingVertical: Spacing.lg },
  lookUp: { maxWidth: '100%' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.xxl, minHeight: 360 },
  emptyTitle: { ...Typography.subtitle, color: Colors.text, textAlign: 'center' },
  emptyText: { fontSize: 16, lineHeight: 22, color: Colors.textSecondary, textAlign: 'center' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 48,
    paddingHorizontal: Spacing.xl,
    borderRadius: 24,
    backgroundColor: Colors.accent,
    marginTop: Spacing.md,
    alignSelf: 'center',
  },
  primaryText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.accentText },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  link: { fontSize: 15, lineHeight: 20, color: Colors.text, textDecorationLine: 'underline' },
  mini: { position: 'absolute', left: 0, right: 0, bottom: Spacing.md },
  exploreActions: { flexDirection: 'row', gap: Spacing.sm, marginHorizontal: Spacing.md, marginBottom: Spacing.sm },
  exploreButton: {
    flex: 1,
    minHeight: TapTarget,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: TapTarget / 2,
    backgroundColor: Colors.accent,
  },
  exploreLabel: { ...Ui.label, color: Colors.accentText, textAlign: 'center' },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.35)', padding: Spacing.xl },
  fallbackSheet: { backgroundColor: Colors.background, borderRadius: 28, padding: Spacing.xl, gap: Spacing.lg, maxHeight: '80%', width: '100%' },
  fallbackScroll: { maxHeight: 300 },
  fallbackText: { lineHeight: 20 },
});
