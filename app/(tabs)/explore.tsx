import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DecodedLine } from '@/components/decoded/decoded-line';
import { RewindEmblem } from '@/components/emblems';
import { ThemedText } from '@/components/themed-text';
import { MiniPlayer } from '@/components/mini-player';
import { NoteSheet } from '@/components/note-sheet';
import { PressableScale } from '@/components/pressable-scale';
import {
  Bars,
  Clock,
  IcebergCard,
  PosterCard,
  ReceiptCard,
  Section,
  ShareButton,
  shareCard,
  Stat,
  Tiles,
  TypeBadge,
} from '@/components/you/you-cards';
import { Tasteform } from '@/components/tasteform/tasteform';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing, Fonts, Ui } from '@/constants/theme';
import { useListenersNow } from '@/hooks/use-listeners-now';
import { usePlayback } from '@/hooks/use-playback';
import { useTasteDecoded } from '@/hooks/use-taste-decoded';
import {
  countSongsHeard,
  describeGrowth,
  describeListeners,
  summarizeFinds,
  withLikedAt,
  type DiscoveryTrack,
  type SwipeEntry,
} from '@/lib/discovery';
import {
  loadBestStreaks,
  loadBlindTest,
  loadLikedTracks,
  loadSwipeHistory,
  setLikedNote,
  type BestStreaks,
  type BlindTestResult,
} from '@/lib/discovery-storage';
import { setNote } from '@/lib/saved-songs';
import { FILE_FAIL_TEXT, importAndKeepFile, loadSpotifyLibrary, type SpotifyLibrary } from '@/lib/spotify-api';
import {
  biggest,
  compact,
  decades,
  decisionSpeed,
  findClock,
  hitRate,
  iceberg,
  listenerType,
  listeningAge,
  mainstream,
  newToYou,
  range,
  receipt,
  streaks as dayStreaks,
  topArtists,
} from '@/lib/you-stats';

const fmt = (n: number) => describeListeners(n).count;

const shortDay = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Zoomed into the Tasteform, one finger moves around the shape instead of the page.
  const [zoomed, setZoomed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [finds, setFinds] = useState<DiscoveryTrack[]>([]);
  const [history, setHistory] = useState<SwipeEntry[]>([]);
  const [best, setBest] = useState<BestStreaks>({ spot: 0, h2h: 0 });
  const [blindTest, setBlindTest] = useState<BlindTestResult | null>(null);
  // Only a Spotify file the person imported feeds stats (Spotify's Developer Policy rules out the login's songs).
  const [spotifyFile, setSpotifyFile] = useState<SpotifyLibrary | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  // "Today" for streaks and dates, refreshed each time you open the tab.
  const [today, setToday] = useState(() => Date.now());
  const icebergRef = useRef<View>(null);
  const receiptRef = useRef<View>(null);
  const posterRef = useRef<View>(null);
  const decoded = useTasteDecoded(finds, history);

  // Tap a cover in the Tasteform to hear it. Leaving the tab stops it and
  // forgets it, since another screen may load a different song meanwhile.
  const { player, status } = usePlayback();
  const [nowPlaying, setNowPlaying] = useState<DiscoveryTrack | null>(null);
  const [noteTrack, setNoteTrack] = useState<DiscoveryTrack | null>(null);
  useFocusEffect(
    useCallback(() => {
      return () => {
        player.pause();
        setNowPlaying(null);
      };
    }, [player])
  );
  function togglePlay(track: DiscoveryTrack) {
    if (nowPlaying?.id === track.id) {
      if (status.playing) player.pause();
      else player.play();
      return;
    }
    setNowPlaying(track);
    if (!track.previewUrl) return;
    player.replace(track.previewUrl);
    player.play();
  }

  async function saveNote(track: DiscoveryTrack, text: string) {
    const next = setNote(finds, track.id, text);
    setFinds(next);
    setNowPlaying((p) => (p?.id === track.id ? (next.find((t) => t.id === track.id) ?? p) : p));
    await setLikedNote(track.id, text);
  }

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [liked, h, streaks, test, file] = await Promise.all([
          loadLikedTracks(),
          loadSwipeHistory(),
          loadBestStreaks(),
          loadBlindTest(),
          loadSpotifyLibrary('file'),
        ]);
        if (cancelled) return;
        setToday(Date.now());
        setBest(streaks);
        setBlindTest(test);
        setSpotifyFile(file);
        setFinds(withLikedAt(liked, h));
        setHistory(h);
        setLoaded(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const now = useListenersNow(finds.map((t) => t.artistName));
  const summary = summarizeFinds(
    finds.map((t) => ({ artistName: t.artistName, found: t.artistListeners, now: now[t.artistName] }))
  );
  const calledIt = finds.filter(
    (t) => t.artistListeners != null && now[t.artistName] != null && describeGrowth(t.artistListeners, now[t.artistName]).calledIt
  );
  const heard = countSongsHeard(history);
  const firstFind = [...finds].filter((t) => t.likedAt != null).sort((a, b) => a.likedAt! - b.likedAt!)[0];

  // ---------- The numbers (lib/you-stats.ts) ----------
  const rate = hitRate(history);
  const tiers = iceberg(finds);
  const speed = decisionSpeed(history);
  const clock = findClock(finds);
  const days = dayStreaks(finds, today);
  const genres = range(finds, history);
  const kind = listenerType({
    finds: finds.length,
    medianFound: summary.medianFound,
    genresLiked: genres.liked,
    peak: clock.peak,
    oneIn: rate.oneIn,
    decideSeconds: speed?.median ?? null,
    called: calledIt.length,
  });
  const bill = receipt(finds, 10);
  const songs = spotifyFile?.likes ?? [];
  const age = listeningAge(songs);
  const popular = mainstream(songs);
  const fresh = newToYou(finds, songs);
  const eras = decades(songs);
  const peak = biggest(songs);
  const lineup = topArtists(songs, 18);

  async function importFile() {
    setImportNote(null);
    const library = await importAndKeepFile();
    if (typeof library === 'string') {
      if (library !== 'cancelled') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return setImportNote(FILE_FAIL_TEXT[library]);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSpotifyFile(library);
  }

  if (!loaded) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={Colors.accent} />
      </ThemedView>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        scrollEnabled={!zoomed}
        contentContainerStyle={[styles.scrollContainer, { paddingTop: insets.top, paddingBottom: nowPlaying ? 180 : 0 }]}>
        <ThemedView style={styles.container}>
          <ThemedText type="eyebrow">Blindspot · what you hear</ThemedText>
          <ThemedText type="hero">Your ears</ThemedText>

          {finds.length === 0 ? (
            <ThemedText style={styles.dim}>
              Nothing found yet. Double-tap a song on Home to save it, and your shape starts growing here.
            </ThemedText>
          ) : (
            <>
              <TypeBadge name={kind.name} why={kind.why} />
              <Tasteform
                liked={finds}
                history={history}
                width={width - 2 * Spacing.lg}
                selectedId={nowPlaying?.id ?? null}
                playing={status.playing}
                onPick={togglePlay}
                onZoomChange={setZoomed}
              />
              {decoded.ready && (
                <DecodedLine finding={decoded.findings[0] ?? null} prompt={decoded.prompt} isNew={decoded.isNew} />
              )}

              <PressableScale onPress={() => router.push('/rewind')} style={styles.rewind}>
                <RewindEmblem size={44} />
                <View style={styles.rewindText}>
                  <ThemedText style={styles.rewindTitle}>Rewind</ThemedText>
                  <ThemedText style={styles.dim}>Drag back through your finds.</ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </PressableScale>

              <ThemedView style={styles.hero} backgroundColor="transparent">
                <ThemedText style={styles.heroNumber}>{finds.length}</ThemedText>
                <ThemedText style={styles.dim}>songs found blind{heard > 0 ? `, out of ${heard} you heard` : ''}.</ThemedText>
              </ThemedView>

              <Tiles
                tiles={[
                  { big: rate.oneIn ? `1 in ${rate.oneIn}` : '—', label: 'songs you hear, you save' },
                  { big: summary.medianFound != null ? compact(summary.medianFound) : '—', label: 'median listeners when found' },
                  { big: String(calledIt.length), label: calledIt.length === 1 ? 'artist you called' : 'artists you called' },
                ]}
              />

              <Section label="Your iceberg">
                <ThemedText style={styles.dim}>
                  Every artist you found blind, by how many listeners they had when you found them.
                </ThemedText>
                <IcebergCard cardRef={icebergRef} tiers={tiers} />
                <ShareButton label="Share my iceberg" onPress={() => shareCard(icebergRef, 'Share your iceberg')} />
              </Section>

              <Section label="How you listen">
                {speed && (
                  <Stat
                    big={`${speed.median}s`}
                    line={`You decide in ${speed.median} seconds.${speed.keep ? ` Songs you keep get ${speed.keep}.` : ''}`}
                  />
                )}
                {clock.peak && (
                  <>
                    <Clock hours={clock.hours} />
                    <ThemedText style={styles.line}>Most of your finds happen {clock.peak}.</ThemedText>
                  </>
                )}
                <ThemedText style={styles.line}>
                  {days.current > 1
                    ? `A ${days.current}-day streak going. Your best: ${days.longest} days in a row. `
                    : days.longest > 1
                      ? `Your best run: ${days.longest} days in a row with a find. `
                      : ''}
                  <ThemedText style={days.longest > 1 ? styles.dim : undefined}>
                    You&apos;ve found songs on {days.days} different {days.days === 1 ? 'day' : 'days'}.
                  </ThemedText>
                </ThemedText>
                {rate.trend && (
                  <ThemedText style={styles.dim}>
                    {rate.trend === 'pickier'
                      ? 'You’re getting pickier: you save fewer of the songs you hear than when you started.'
                      : 'You’re saving more of what you hear than when you started.'}
                  </ThemedText>
                )}
              </Section>

              <Section label="Your range">
                <Stat
                  big={String(genres.liked)}
                  line={`${genres.liked === 1 ? 'genre' : 'genres'} you've liked blind, out of ${genres.heard} you've heard${genres.top ? `. Most of all ${genres.top}.` : '.'}`}
                />
                {blindTest && (
                  <ThemedText style={styles.dim}>
                    On your Blind Spot Test you liked {blindTest.neverLiked} {blindTest.neverLiked === 1 ? 'song' : 'songs'} from
                    genres you said you&apos;d never like.
                  </ThemedText>
                )}
              </Section>

              <Section label="Called it">
                {calledIt.length > 0 ? (
                  <ThemedView style={styles.block} backgroundColor="transparent">
                    <ThemedText style={styles.line}>
                      You called <ThemedText style={styles.em}>{calledIt.length}</ThemedText> — they&apos;ve at least doubled
                      since you found them:
                    </ThemedText>
                    {calledIt.map((t) => (
                      <ThemedText key={t.id} style={styles.dim}>
                        {t.artistName}: {fmt(t.artistListeners!)} → {fmt(now[t.artistName])}
                      </ThemedText>
                    ))}
                  </ThemedView>
                ) : summary.best ? (
                  <ThemedText style={styles.line}>
                    Best call so far: <ThemedText style={styles.em}>{summary.best.artistName}</ThemedText>, up {summary.best.pct}%
                    since you found them.
                  </ThemedText>
                ) : (
                  <ThemedText style={styles.line}>None of your finds have grown yet. When one doubles, you called it.</ThemedText>
                )}
                {summary.medianFound != null && (
                  <ThemedText style={styles.dim}>
                    Half your finds had under {fmt(summary.medianFound)} listeners when you found them.{' '}
                    {describeListeners(summary.medianFound).verdict}
                  </ThemedText>
                )}
              </Section>

              <Section label="Your receipt">
                <ReceiptCard
                  cardRef={receiptRef}
                  lines={bill.lines}
                  total={bill.total}
                  median={summary.medianFound != null ? compact(summary.medianFound) : null}
                  date={shortDay(today)}
                />
                <ShareButton label="Share my receipt" onPress={() => shareCard(receiptRef, 'Share your receipt')} />
              </Section>

              <Section label="Your Spotify" spotify>
                {songs.length > 0 ? (
                  <>
                    {age && (
                      <Stat
                        big={String(age.year)}
                        line={`Your library sounds like ${age.year}. Half of it came out between ${age.from} and ${age.to}.`}
                      />
                    )}
                    {popular && (
                      <Stat
                        big={`${popular.score}`}
                        line={`out of 100 on Spotify popularity: ${popular.label}.${
                          summary.medianFound != null
                            ? ` Your blind finds: half under ${fmt(summary.medianFound)} listeners.`
                            : ''
                        }`}
                      />
                    )}
                    {fresh && (
                      <Stat
                        big={`${Math.round(fresh.share * 100)}%`}
                        line="of your blind finds are artists nowhere in your Spotify."
                      />
                    )}
                    {eras.length > 0 && (
                      <Bars rows={eras.slice(0, 6).map((e) => ({ label: e.decade, share: e.share, count: e.count }))} />
                    )}
                    {peak.year && (
                      <ThemedText style={styles.line}>
                        {peak.year.year} was your biggest year: {peak.year.count.toLocaleString('en-US')} songs saved.
                        {peak.day ? ` Your biggest day: ${shortDay(peak.day.at)}, ${peak.day.count} songs.` : ''}
                      </ThemedText>
                    )}
                    {lineup.length >= 3 && (
                      <>
                        <PosterCard
                          cardRef={posterRef}
                          artists={lineup.map((a) => a.artist)}
                          year={new Date(today).getFullYear()}
                        />
                        <ShareButton label="Share my lineup" onPress={() => shareCard(posterRef, 'Share your festival lineup')} />
                      </>
                    )}
                    <ThemedText style={styles.dim}>
                      From your Spotify file: {songs.length.toLocaleString('en-US')} songs, imported{' '}
                      {shortDay(spotifyFile!.syncedAt)}.{' '}
                      <ThemedText style={styles.link} onPress={importFile}>
                        Import again
                      </ThemedText>
                    </ThemedText>
                  </>
                ) : (
                  <>
                    <ThemedText style={styles.line}>
                      See the year your library sounds like, how mainstream it is, your decades, and your own festival lineup.
                    </ThemedText>
                    <ThemedText style={styles.dim}>
                      Export from exportify.app (Liked Songs, or Export All), then import the file here. It stays on your phone,
                      and Home stops showing you artists you already have.
                    </ThemedText>
                    <PressableScale onPress={importFile} style={[Ui.outlineButton, styles.importButton]}>
                      <Ionicons name="document-outline" size={16} color={Colors.text} />
                      <ThemedText style={Ui.label}>Import a Spotify file</ThemedText>
                    </PressableScale>
                  </>
                )}
                {importNote && <ThemedText style={styles.dim}>{importNote}</ThemedText>}
              </Section>

              {(best.spot > 0 || best.h2h > 0) && (
                <ThemedText style={styles.streaks}>
                  Best streaks · Spot the Star {best.spot} · Head to Head {best.h2h}
                </ThemedText>
              )}

              {firstFind && (
                <ThemedText style={styles.dim}>
                  First find: {firstFind.trackName} by {firstFind.artistName}, {shortDay(firstFind.likedAt!)}.
                </ThemedText>
              )}
            </>
          )}
          <ThemedText type="caption" style={styles.about}>
            Blindspot is a student project. Song previews provided courtesy of iTunes; listener counts from Last.fm. No accounts —
            Daily Drop votes are anonymous and tied only to a random device id.
          </ThemedText>
        </ThemedView>
      </ScrollView>
      {nowPlaying && (
        <View style={styles.mini}>
          <MiniPlayer
            track={nowPlaying}
            playing={status.playing}
            progress={status.duration ? status.currentTime / status.duration : 0}
            onToggle={() => togglePlay(nowPlaying)}
            onEditNote={() => setNoteTrack(nowPlaying)}
          />
        </View>
      )}
      <NoteSheet track={noteTrack} onSave={saveNote} onClose={() => setNoteTrack(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  // Pinned over the page, like the Liked screen's player.
  mini: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Spacing.md,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // No box: the big number sits on a thin rule, like the collage on Home.
  hero: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
    paddingBottom: Spacing.lg,
    gap: 2,
  },
  // A row, not a button: the emblem says what it is, the chevron says it opens.
  rewind: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.rule,
  },
  rewindText: {
    flex: 1,
  },
  rewindTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 18,
    lineHeight: 22,
  },
  streaks: {
    ...Ui.label,
    color: Colors.textSecondary,
  },
  heroNumber: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '800',
    color: Colors.signal,
    fontFamily: Fonts.display,
  },
  block: {
    gap: Spacing.xs,
  },
  line: {
    fontSize: 18,
    lineHeight: 26,
  },
  // Cream, not red: red is kept for the one big number at the top.
  em: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  about: {
    color: Colors.textTertiary,
    marginTop: Spacing.xl,
  },
  dim: {
    color: Colors.textSecondary,
  },
  link: {
    color: Colors.text,
    textDecorationLine: 'underline',
  },
  importButton: {
    alignSelf: 'flex-start',
  },
});
