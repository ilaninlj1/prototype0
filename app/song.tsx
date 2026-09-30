import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppleMusicLink, SpotifyLink, CreditLine, LastfmLink } from '@/components/credits';
import { DoubleTapLike } from '@/components/double-tap-like';
import { LikeButton } from '@/components/like-button';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { artworkUrl, describeListeners, type DiscoveryTrack } from '@/lib/discovery';
import { fetchArtistListeners } from '@/lib/pool';
import {
  fetchCollectors,
  fetchCredits,
  fetchStory,
  fetchTrackStats,
  lookupTracks,
  type Collectors,
  type Story,
  type TrackStats,
} from '@/lib/song-details';
import type { Credits } from '@/lib/song-facts';
import { fetchComments } from '@/lib/supabase';

const fmt = (n: number) => describeListeners(n).count;
const LOADING = undefined;

/** Everything we can find about one song — much of it things streaming apps don't show. */
export default function SongScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, country } = useLocalSearchParams<{ id: string; country?: string }>();
  const { player, status } = usePlayback();

  const [track, setTrack] = useState<DiscoveryTrack | null>(null);
  const [artistListeners, setArtistListeners] = useState<number | null | undefined>(LOADING);
  const [stats, setStats] = useState<TrackStats | null | undefined>(LOADING);
  const [credits, setCredits] = useState<Credits | null | undefined>(LOADING);
  const [collectors, setCollectors] = useState<Collectors | null | undefined>(LOADING);
  const [story, setStory] = useState<Story | null | undefined>(LOADING);
  const [commentCount, setCommentCount] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    lookupTracks([Number(id)], country ?? 'US').then(([t]) => {
      if (!t) return;
      setTrack(t);
      fetchArtistListeners(t.artistName).then(setArtistListeners);
      fetchTrackStats(t.artistName, t.trackName).then(setStats);
      fetchStory(t.artistName, t.trackName).then(setStory);
      fetchCredits(t.artistName, t.trackName).then(setCredits);
      if (t.collectionName) fetchCollectors(t.artistName, t.collectionName).then(setCollectors);
      else setCollectors(null);
      fetchComments(t.id).then((c) => setCommentCount(c?.length ?? 0));
    });
  }, [id, country]);

  useFocusEffect(useCallback(() => () => player.pause(), [player]));

  function togglePlay() {
    if (!track) return;
    if (playing && status.playing) {
      player.pause();
      setPlaying(false);
      return;
    }
    player.replace(track.previewUrl);
    player.play();
    setPlaying(true);
  }

  if (!track) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={Colors.text} />
      </View>
    );
  }

  const openComments = () =>
    router.push({ pathname: '/comments', params: { trackId: String(track.id), title: track.trackName, artist: track.artistName } });

  return (
    <View style={styles.screen}>
      <Image source={{ uri: artworkUrl(track.artworkUrl100, 100) }} style={StyleSheet.absoluteFill} blurRadius={60} />
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </Pressable>

        <DoubleTapLike track={{ ...track, artistListeners: artistListeners ?? undefined }}>
          <Image source={{ uri: artworkUrl(track.artworkUrl100, 600) }} style={styles.art} />
        </DoubleTapLike>

        <ThemedText type="eyebrow">{track.collectionName ?? track.primaryGenreName}</ThemedText>
        <ThemedText type="title">{track.trackName}</ThemedText>
        <ThemedText style={styles.artist}>{track.artistName}</ThemedText>

        <View style={styles.actions}>
          <Pressable style={styles.play} onPress={togglePlay}>
            <Ionicons name={playing && status.playing ? 'pause' : 'play'} size={20} color={Colors.accentText} />
            <ThemedText type="label" style={{ color: Colors.accentText }}>
              Preview
            </ThemedText>
          </Pressable>
          <LikeButton track={{ ...track, artistListeners: artistListeners ?? undefined }} size={28} />
          <Pressable style={styles.chat} onPress={openComments}>
            <Ionicons name="chatbubble-outline" size={20} color={Colors.text} />
            <ThemedText type="label">{commentCount ? `${commentCount}` : 'Comments'}</ThemedText>
          </Pressable>
        </View>

        {/* The numbers */}
        <View style={styles.stats}>
          <Stat big={artistListeners ? fmt(artistListeners) : artistListeners === LOADING ? '…' : '—'} label="artist listeners" />
          <Stat big={stats ? fmt(stats.plays) : stats === LOADING ? '…' : '—'} label="plays of this song" />
          <Stat big={stats?.replay != null ? `${stats.replay}×` : stats === LOADING ? '…' : '—'} label="replay score" />
        </View>
        {stats?.replay != null && (
          <ThemedText style={styles.explain}>
            Each person who plays it comes back about {Math.round(stats.replay)} times.
            {stats.replay >= 10 ? " That's a song people can't stop playing." : ''}
          </ThemedText>
        )}

        <Section title="The story" loading={story === LOADING} empty={!story}>
          {story && (
            <>
              <ThemedText style={styles.body}>{story.text}</ThemedText>
              <Pressable onPress={() => Linking.openURL(story.url).catch(() => {})}>
                <ThemedText type="link" style={styles.small}>
                  Read more on Wikipedia
                </ThemedText>
              </Pressable>
            </>
          )}
        </Section>

        <Section title="Who made it" loading={credits === LOADING} empty={!credits || (credits.players.length + credits.crew.length + credits.writers.length === 0)}>
          {credits && (
            <>
              {credits.firstRelease && <Line label="First released" value={credits.firstRelease} />}
              {credits.writers.length > 0 && <Line label="Written by" value={credits.writers.join(', ')} />}
              {credits.players.map((p) => (
                <Line key={p.name} label={p.name} value={p.roles.join(', ')} />
              ))}
              {credits.crew.slice(0, 6).map((p) => (
                <Line key={p.name} label={p.name} value={p.roles.join(', ')} dim />
              ))}
              {credits.versions.length > 0 && (
                <Line label="Also became" value={credits.versions.slice(0, 3).join(' · ')} />
              )}
              <ThemedText style={styles.source}>Credits from MusicBrainz</ThemedText>
            </>
          )}
        </Section>

        <Section title="On vinyl" loading={collectors === LOADING} empty={!collectors}>
          {collectors && (
            <>
              <ThemedText style={styles.body}>
                <ThemedText style={styles.em}>{collectors.have.toLocaleString()}</ThemedText> people own this record.{' '}
                <ThemedText style={styles.em}>{collectors.want.toLocaleString()}</ThemedText> want it.
              </ThemedText>
              {collectors.styles.length > 0 && <Line label="Collectors file it under" value={collectors.styles.join(', ')} />}
              <ThemedText style={styles.source}>From Discogs</ThemedText>
            </>
          )}
        </Section>

        <View style={styles.links}>
          <AppleMusicLink trackId={track.id} url={track.trackViewUrl} />
          <SpotifyLink artist={track.artistName} title={track.trackName} />
          <LastfmLink artist={track.artistName} />
        </View>
        <CreditLine />
      </ScrollView>
    </View>
  );
}

function Stat({ big, label }: { big: string; label: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText style={styles.statNum}>{big}</ThemedText>
      <ThemedText type="eyebrow" style={styles.statLabel}>
        {label}
      </ThemedText>
    </View>
  );
}

function Section({ title, loading, empty, children }: { title: string; loading: boolean; empty: boolean; children: ReactNode }) {
  if (!loading && empty) return null;
  return (
    <View style={styles.section}>
      <ThemedText type="eyebrow" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {loading ? <ActivityIndicator color={Colors.textSecondary} style={styles.spinner} /> : children}
    </View>
  );
}

function Line({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <View style={styles.line}>
      <ThemedText style={[styles.lineLabel, dim && styles.dim]} numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText style={[styles.lineValue, dim && styles.dim]}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  scrim: { backgroundColor: 'rgba(19, 33, 63, 0.82)' },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl * 2, gap: Spacing.xs },
  back: { alignSelf: 'flex-start', marginBottom: Spacing.sm },
  art: { width: '100%', aspectRatio: 1, borderRadius: Radius.lg, marginBottom: Spacing.lg },
  artist: { fontSize: 17, color: Colors.textSecondary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, marginTop: Spacing.lg },
  play: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.accent, borderRadius: Radius.pill, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg },
  chat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xl, gap: Spacing.sm },
  stat: { flex: 1 },
  statNum: { fontFamily: Fonts.display, fontSize: 28, lineHeight: 32, color: Colors.signal, letterSpacing: -0.8 },
  statLabel: { fontSize: 9, letterSpacing: 1.2 },
  explain: { fontFamily: Fonts.note, fontSize: 19, lineHeight: 22, color: Colors.textSecondary, marginTop: Spacing.sm, transform: [{ rotate: '-1deg' }] },
  section: { marginTop: Spacing.xl, gap: Spacing.xs },
  sectionTitle: { marginBottom: Spacing.xs },
  spinner: { alignSelf: 'flex-start' },
  body: { fontSize: 16, lineHeight: 23 },
  em: { fontFamily: 'Figtree_700Bold', color: Colors.signal },
  small: { fontSize: 13, marginTop: Spacing.xs },
  line: { flexDirection: 'row', gap: Spacing.md, paddingVertical: 3 },
  lineLabel: { fontFamily: 'Figtree_600SemiBold', fontSize: 14, width: '42%' },
  lineValue: { flex: 1, fontSize: 14, color: Colors.textSecondary },
  dim: { opacity: 0.7 },
  source: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textTertiary, marginTop: Spacing.xs },
  links: { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.xl },
});
