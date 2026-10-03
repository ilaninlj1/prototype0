import { FontAwesome, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeInLeft,
  FadeInRight,
  runOnJS,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniPlayer } from '@/components/mini-player';
import { Cassette } from '@/components/rewind/cassette';
import { RewindStrip } from '@/components/rewind/rewind-strip';
import { SpotifySheet } from '@/components/rewind/spotify-sheet';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing, Ui } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { artworkUrl, withLikedAt, type DiscoveryTrack, type SwipeEntry } from '@/lib/discovery';
import { loadLikedTracks, loadSwipeHistory } from '@/lib/discovery-storage';
import {
  agoLabel,
  BAND_STARTS,
  dayOf,
  dayStart,
  heardIn,
  inPeriod,
  jump,
  likesInPeriod,
  offsetLabel,
  periodLabel,
  periodLine,
  periodStart,
  shortDate,
  UNITS,
  type Place,
  type Unit,
} from '@/lib/rewind';
import { describeImport, spotifyTrackUrl, type SpotifyLike } from '@/lib/spotify';
import {
  clearSpotifyLibrary,
  FAIL_TEXT,
  importSpotifyLikes,
  loadSpotifyLibrary,
  saveSpotifyLibrary,
  spotifyReturnUrl,
  type SpotifyLibrary,
} from '@/lib/spotify-api';

const SPRING = { damping: 18, stiffness: 220 };
/** Degrees the reels turn per point dragged, and how far they whirr on each kind of jump. */
const REEL_PER_POINT = 1.5;
const WHIRR: Record<Unit, { turns: number; ms: number; ticks: number }> = {
  day: { turns: 0.5, ms: 320, ticks: 1 },
  month: { turns: 2, ms: 600, ticks: 4 },
  year: { turns: 5, ms: 950, ticks: 8 },
};
const IMPACT: Record<Unit, Haptics.ImpactFeedbackStyle> = {
  day: Haptics.ImpactFeedbackStyle.Light,
  month: Haptics.ImpactFeedbackStyle.Medium,
  year: Haptics.ImpactFeedbackStyle.Heavy,
};

/** A huge playlist-import day could be hundreds of covers; past this many, the rest is a count. */
const SPOTIFY_SHOWN_MAX = 60;

/** Always one day on screen: the latest one with songs, to start. */
function latest(times: number[]): Place | null {
  if (!times.length) return null;
  const at = Math.max(...times);
  return { at, want: dayOf(at), dir: -1 };
}

/** The zone a drag of x points is in: 1 day, 2 month, 3 year, signed by direction (negative = earlier). */
function zoneOf(x: number, half: number): number {
  'worklet';
  const share = Math.abs(x) / half;
  const i = share >= BAND_STARTS.year ? 3 : share >= BAND_STARTS.month ? 2 : share >= BAND_STARTS.day ? 1 : 0;
  return x < 0 ? -i : i;
}

/** Past either end the thumb still follows, but slower, like pulling against a spring. */
function rubber(x: number, half: number): number {
  'worklet';
  const a = Math.abs(x);
  return Math.sign(x) * (a <= half ? a : half + (a - half) * 0.25);
}

/**
 * Rewind: your finds, one day (or month, or year) at a time. Drag left to go
 * back; how far you drag sets the step, and every step lands on a day you
 * actually found something. Tap a cover to hear it.
 */
export default function RewindScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const half = (width - 2 * Spacing.lg) / 2;
  const [now] = useState(() => Date.now());

  const [loaded, setLoaded] = useState(false);
  const [finds, setFinds] = useState<DiscoveryTrack[]>([]);
  const [history, setHistory] = useState<SwipeEntry[]>([]);
  const [view, setView] = useState<Place | null>(null);
  const [band, setBand] = useState(0);

  // Spotify liked songs: kept apart from your finds, shown only while the switch is on.
  const [spotify, setSpotify] = useState<SpotifyLibrary | null>(null);
  const [spotifyOn, setSpotifyOn] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [liked, h, library] = await Promise.all([loadLikedTracks(), loadSwipeHistory(), loadSpotifyLibrary()]);
      if (cancelled) return;
      const dated = withLikedAt(liked, h).filter((t) => t.likedAt != null);
      setFinds(dated);
      setHistory(h);
      const withSpotify = !!library?.likes.length;
      setSpotify(library);
      setSpotifyOn(withSpotify);
      // Open on your latest find (or latest Spotify like, if that's all there is).
      setView(latest(dated.length || !withSpotify ? dated.map((t) => t.likedAt!) : library!.likes.map((l) => l.addedAt)));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const findTimes = useMemo(() => finds.map((t) => t.likedAt!), [finds]);
  const likes = useMemo(() => (spotifyOn && spotify ? spotify.likes : []), [spotifyOn, spotify]);
  const times = useMemo(() => (likes.length ? [...findTimes, ...likes.map((l) => l.addedAt)] : findTimes), [findTimes, likes]);
  const shown = useMemo(() => (view ? inPeriod(finds, view.at, 'day') : []), [finds, view]);
  const liked = useMemo(() => (view ? likesInPeriod(likes, view.at, 'day') : []), [likes, view]);
  const heard = useMemo(() => (view ? heardIn(history, view.at, 'day') : 0), [history, view]);
  // One or two covers get drawn bigger, so a quiet day doesn't look empty.
  const sizeFor = (count: number) => {
    const columns = count <= 2 ? 2 : 3;
    return Math.floor((width - 2 * Spacing.lg - (columns - 1) * Spacing.md) / columns);
  };
  const cover = sizeFor(shown.length);
  const spotifyCover = sizeFor(liked.length);
  const canGo = useCallback((unit: Unit, dir: -1 | 1) => view != null && jump(times, view, unit, dir) != null, [times, view]);

  // Playback, the same way as the Profile tab: leaving stops it.
  const { player, status } = usePlayback();
  const [nowPlaying, setNowPlaying] = useState<DiscoveryTrack | null>(null);
  useFocusEffect(
    useCallback(() => {
      return () => player.pause();
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

  // ---------- Spotify ----------

  /** After the switch or a removal: stay put if there's still something here, else go to the latest thing left. */
  function settle(left: number[], onlyFinds: boolean) {
    if (!view) return setView(latest(left));
    if (onlyFinds && inPeriod(finds, view.at, 'day').length === 0) setView(latest(left));
  }

  function toggleSpotify() {
    if (importing != null) return;
    if (!spotify?.likes.length) return setSheet(true);
    Haptics.selectionAsync();
    const on = !spotifyOn;
    setSpotifyOn(on);
    settle(on ? [...findTimes, ...spotify.likes.map((l) => l.addedAt)] : findTimes, !on);
  }

  async function connect() {
    setSheet(false);
    setNotice(null);
    setImporting(0);
    const result = await importSpotifyLikes(setImporting);
    setImporting(null);
    if (typeof result === 'string') {
      if (result !== 'cancelled') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return setNotice(result === 'wrong-link' ? `${FAIL_TEXT[result]} ${spotifyReturnUrl()}` : FAIL_TEXT[result]);
    }
    const library = { syncedAt: Date.now(), likes: result };
    await saveSpotifyLibrary(library);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSpotify(library);
    setSpotifyOn(result.length > 0);
    setNotice(result.length ? `Brought in ${describeImport(result, now)}` : describeImport(result, now));
    if (!view) setView(latest(result.map((l) => l.addedAt)));
  }

  function removeSpotify() {
    Alert.alert('Remove your Spotify likes?', 'They’re deleted from this phone. Your Blindspot finds stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await clearSpotifyLibrary();
          setSpotify(null);
          setSpotifyOn(false);
          setNotice(null);
          settle(findTimes, true);
        },
      },
    ]);
  }

  // ---------- The scrub ----------
  const dx = useSharedValue(0);
  const spin = useSharedValue(0);
  const spinAtStart = useSharedValue(0);
  const zone = useSharedValue(0);
  const shake = useSharedValue(0);

  function bump() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    shake.set(
      withSequence(
        withTiming(-8, { duration: 50 }),
        withRepeat(withTiming(8, { duration: 80 }), 3, true),
        withTiming(0, { duration: 50 })
      )
    );
    spin.set(withSpring(spinAtStart.get(), SPRING));
  }

  function go(unit: Unit, dir: -1 | 1) {
    if (!view) return;
    const next = jump(times, view, unit, dir);
    if (!next) return bump();
    setView(next);
    // A jump whirrs the reels and ticks like a tape winding, then lands with a thump sized to the jump.
    const w = WHIRR[unit];
    spin.set(withTiming(spin.get() + dir * w.turns * 360, { duration: w.ms, easing: Easing.out(Easing.cubic) }));
    for (let i = 0; i < w.ticks; i++) setTimeout(() => Haptics.selectionAsync(), i * 50);
    setTimeout(() => Haptics.impactAsync(IMPACT[unit]), w.ticks * 50);
  }

  function onZone(z: number) {
    setBand(z);
    if (z !== 0) Haptics.selectionAsync();
  }

  function onRelease(z: number) {
    setBand(0);
    if (z === 0) spin.set(withSpring(spinAtStart.get(), SPRING));
    else go(UNITS[Math.abs(z) - 1], z < 0 ? -1 : 1);
  }

  const scrub = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-16, 16])
    .onStart(() => {
      spinAtStart.set(spin.get());
    })
    .onUpdate((e) => {
      const x = rubber(e.translationX, half);
      dx.set(x);
      spin.set(spinAtStart.get() + x * REEL_PER_POINT);
      const z = zoneOf(x, half);
      if (z !== zone.get()) {
        zone.set(z);
        runOnJS(onZone)(z);
      }
    })
    .onEnd(() => {
      const z = zone.get();
      zone.set(0);
      dx.set(withSpring(0, SPRING));
      runOnJS(onRelease)(z);
    });

  // What letting go right now would do, in words.
  const preview = useMemo(() => {
    if (!view || band === 0) return null;
    const unit = UNITS[Math.abs(band) - 1];
    const dir = band < 0 ? -1 : 1;
    const next = jump(times, view, unit, dir);
    if (!next) return `No songs ${dir < 0 ? 'before' : 'after'} this day`;
    const off = offsetLabel(next.at, next.want) ? ` · closest to ${shortDate(dayStart(next.want), next.at)}` : '';
    return `${dir < 0 ? 'Back' : 'Ahead'} a ${unit}: ${periodLabel(next.at, 'day', now)}${off}`;
  }, [band, times, view, now]);

  if (!loaded) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  const ago = view ? agoLabel(view.at, 'day', now) : null;
  const off = view ? offsetLabel(view.at, view.want) : null;

  return (
    <GestureDetector gesture={scrub}>
      <View style={[styles.screen, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close" style={Ui.textButton}>
            <Ionicons name="close" size={26} color={Colors.textSecondary} />
          </Pressable>
          <Cassette spin={spin} size={72} />
          {/* The Spotify switch: connects the first time, then shows or hides your Spotify likes. */}
          <Pressable
            onPress={toggleSpotify}
            hitSlop={8}
            accessibilityRole="switch"
            accessibilityState={{ checked: spotifyOn }}
            accessibilityLabel="Spotify likes"
            style={[styles.chip, spotifyOn && styles.chipOn]}>
            {importing != null ? (
              <ActivityIndicator size="small" color={Colors.text} />
            ) : (
              <FontAwesome name="spotify" size={16} color={spotifyOn ? Colors.accentText : Colors.text} />
            )}
            <ThemedText style={[styles.chipText, spotifyOn && styles.chipTextOn]}>
              {importing != null ? `${importing}` : spotify?.likes.length ? 'Spotify' : '+ Spotify'}
            </ThemedText>
          </Pressable>
        </View>

        {notice && (
          <Pressable onPress={() => setNotice(null)} style={styles.notice} accessibilityHint="Tap to dismiss">
            <ThemedText style={styles.noticeText}>{notice}</ThemedText>
          </Pressable>
        )}

        {!view ? (
          <View style={styles.empty}>
            <ThemedText type="title">Nothing to rewind yet</ThemedText>
            <ThemedText style={styles.dim}>
              Save songs on Home and they line up here by the day you found them. Or bring in the songs you&apos;ve liked on
              Spotify.
            </ThemedText>
            <Pressable onPress={() => setSheet(true)} style={[Ui.outlineButton, styles.connect]}>
              <FontAwesome name="spotify" size={16} color={Colors.text} />
              <ThemedText style={Ui.label}>Connect Spotify</ThemedText>
            </Pressable>
          </View>
        ) : (
          <>
            <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
              <Animated.View
                key={periodStart(view.at, 'day')}
                entering={(view.dir < 0 ? FadeInLeft : FadeInRight).duration(260)}
                style={styles.period}>
                <ThemedText type="eyebrow">{ago ?? 'Rewind'}</ThemedText>
                <ThemedText type="hero" numberOfLines={1} adjustsFontSizeToFit>
                  {periodLabel(view.at, 'day', now)}
                </ThemedText>
                {/* No songs on the day you aimed at: say how far these are from it. */}
                {off && (
                  <View style={styles.off}>
                    <Ionicons name="locate" size={14} color={Colors.text} />
                    <ThemedText style={styles.offText}>{off}</ThemedText>
                  </View>
                )}
                <ThemedText style={styles.dim}>{periodLine(shown.length, heard, liked.length)}</ThemedText>
                {shown.length > 0 && liked.length > 0 && (
                  <ThemedText type="eyebrow" style={styles.group}>
                    Found blind
                  </ThemedText>
                )}
                {shown.length > 0 && (
                  <View style={styles.grid}>
                    {shown.map((t, i) => {
                      const picked = nowPlaying?.id === t.id;
                      return (
                        <Animated.View key={t.id} entering={FadeIn.delay(Math.min(i, 12) * 30)} style={{ width: cover }}>
                          <Pressable onPress={() => togglePlay(t)} accessibilityLabel={`${t.trackName} by ${t.artistName}`}>
                            <Image
                              source={{ uri: artworkUrl(t.artworkUrl100, 300) }}
                              style={[styles.art, { width: cover, height: cover }]}
                            />
                            {picked && (
                              <View style={styles.playing}>
                                <Ionicons name={status.playing ? 'pause' : 'play'} size={16} color={Colors.accentText} />
                              </View>
                            )}
                            <ThemedText style={styles.song} numberOfLines={1}>
                              {t.trackName}
                            </ThemedText>
                            <ThemedText style={styles.artist} numberOfLines={1}>
                              {t.artistName}
                            </ThemedText>
                          </Pressable>
                        </Animated.View>
                      );
                    })}
                  </View>
                )}

                {liked.length > 0 && (
                  <>
                    <View style={[styles.group, styles.groupRow]}>
                      <FontAwesome name="spotify" size={14} color={Colors.textSecondary} />
                      <ThemedText type="eyebrow">Liked on Spotify</ThemedText>
                    </View>
                    <View style={styles.grid}>
                      {liked.slice(0, SPOTIFY_SHOWN_MAX).map((l, i) => (
                        <SpotifyCover key={l.id} like={l} size={spotifyCover} delay={Math.min(i, 12) * 30} />
                      ))}
                    </View>
                    {liked.length > SPOTIFY_SHOWN_MAX && (
                      <ThemedText style={styles.dim}>And {liked.length - SPOTIFY_SHOWN_MAX} more that day.</ThemedText>
                    )}
                  </>
                )}
              </Animated.View>

              {spotifyOn && spotify && (
                <View style={styles.footer}>
                  <ThemedText style={styles.footerText}>
                    {describeImport(spotify.likes, now)} Synced {shortDate(spotify.syncedAt, now)}. Tap a Spotify cover to open it
                    there.
                  </ThemedText>
                  <View style={styles.footerActions}>
                    <Pressable onPress={connect} hitSlop={8} style={Ui.textButton}>
                      <ThemedText style={styles.link}>Sync again</ThemedText>
                    </Pressable>
                    <Pressable onPress={removeSpotify} hitSlop={8} style={Ui.textButton}>
                      <ThemedText style={styles.link}>Remove</ThemedText>
                    </Pressable>
                  </View>
                </View>
              )}
            </ScrollView>

            {nowPlaying && (
              <MiniPlayer
                track={nowPlaying}
                playing={status.playing}
                progress={status.duration ? status.currentTime / status.duration : 0}
                onToggle={() => togglePlay(nowPlaying)}
              />
            )}

            <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.md }]}>
              <ThemedText style={[styles.hint, preview != null && styles.hintOn]} numberOfLines={1}>
                {preview ?? 'Drag left to go back. Further jumps a month, then a year.'}
              </ThemedText>
              <RewindStrip dx={dx} shake={shake} half={half} band={band} canGo={canGo} onTap={go} />
            </View>
          </>
        )}
        <SpotifySheet visible={sheet} onConnect={connect} onClose={() => setSheet(false)} />
      </View>
    </GestureDetector>
  );
}

/** A Spotify like: its cover with Spotify's mark, opening the song in Spotify (their rules: Spotify content links back to Spotify). */
function SpotifyCover({ like, size, delay }: { like: SpotifyLike; size: number; delay: number }) {
  return (
    <Animated.View entering={FadeIn.delay(delay)} style={{ width: size }}>
      <Pressable
        onPress={() => Linking.openURL(spotifyTrackUrl(like.id))}
        accessibilityLabel={`${like.name} by ${like.artist}, open in Spotify`}>
        <Image source={like.art ? { uri: like.art } : null} style={[styles.art, { width: size, height: size }]} />
        <View style={styles.spotifyMark}>
          <FontAwesome name="spotify" size={14} color="#ffffff" />
        </View>
        <ThemedText style={styles.song} numberOfLines={1}>
          {like.name}
        </ThemedText>
        <ThemedText style={styles.artist} numberOfLines={1}>
          {like.artist}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  empty: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  connect: {
    alignSelf: 'flex-start',
  },
  // Outlined off, cream on, like the app's other switches.
  chip: {
    ...Ui.outlineButton,
    minHeight: 36,
    paddingHorizontal: Spacing.sm,
    gap: 6,
  },
  chipOn: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipText: {
    ...Ui.label,
    fontSize: 11,
  },
  chipTextOn: {
    color: Colors.accentText,
  },
  notice: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: Radius.sm,
  },
  noticeText: {
    fontSize: 14,
    lineHeight: 19,
  },
  group: {
    marginTop: Spacing.xl,
    marginBottom: -Spacing.sm,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Spotify's mark on its covers, in its own black and white.
  spotifyMark: {
    position: 'absolute',
    left: Spacing.xs,
    top: Spacing.xs,
    width: 22,
    height: 22,
    borderRadius: Radius.round,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    marginTop: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
    gap: Spacing.xs,
  },
  footerText: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textTertiary,
  },
  footerActions: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  link: {
    fontSize: 14,
    color: Colors.textSecondary,
    textDecorationLine: 'underline',
  },
  scroll: {
    padding: Spacing.lg,
    paddingTop: 0,
  },
  period: {
    gap: Spacing.xs,
  },
  dim: {
    color: Colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  art: {
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
  },
  // The song you tapped: a cream button on its cover, like the mini player's.
  playing: {
    position: 'absolute',
    right: Spacing.xs,
    top: Spacing.xs,
    width: 28,
    height: 28,
    borderRadius: Radius.round,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  song: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    marginTop: Spacing.xs,
  },
  artist: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textSecondary,
  },
  // How far the songs are from the day you aimed at: a cream outline, read right after the date.
  off: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: Radius.sm,
    marginBottom: Spacing.xs,
  },
  offText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  controls: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  hint: {
    fontSize: 14,
    textAlign: 'center',
    color: Colors.textSecondary,
  },
  hintOn: {
    color: Colors.text,
    fontWeight: '700',
  },
});
