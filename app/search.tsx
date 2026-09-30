import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { artworkUrl, type DiscoveryTrack } from '@/lib/discovery';
import { lookupTracks, searchMusic, type SearchResults } from '@/lib/song-details';
import { groupTalkedAbout } from '@/lib/song-facts';
import { fetchRecentCommentRows } from '@/lib/supabase';

/** Look up any song, artist or album. Search runs on Return, not per keystroke (iTunes rate-limits hard). */
export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [talked, setTalked] = useState<{ track: DiscoveryTrack; count: number }[]>([]);

  useEffect(() => {
    (async () => {
      const rows = await fetchRecentCommentRows();
      const top = groupTalkedAbout(rows ?? []).slice(0, 8);
      const tracks = await lookupTracks(top.map((t) => t.trackId));
      setTalked(tracks.map((track) => ({ track, count: top.find((t) => t.trackId === track.id)?.count ?? 0 })));
    })();
  }, []);

  async function run() {
    const q = term.trim();
    if (!q) return;
    setLoading(true);
    setResults(await searchMusic(q));
    setLoading(false);
  }

  const openSong = (t: DiscoveryTrack) => router.push({ pathname: '/song', params: { id: String(t.id) } });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + Spacing.md }]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </Pressable>
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={18} color={Colors.textTertiary} />
          <TextInput
            value={term}
            onChangeText={setTerm}
            onSubmitEditing={run}
            placeholder="Any song, artist or album"
            placeholderTextColor={Colors.textTertiary}
            returnKeyType="search"
            autoFocus
            style={styles.input}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {loading && <ActivityIndicator color={Colors.text} style={{ marginTop: Spacing.xl }} />}

        {!results && !loading && (
          <>
            <Pressable style={styles.chartsLink} onPress={() => router.push('/charts')}>
              <Ionicons name="trending-up" size={20} color={Colors.signal} />
              <ThemedText style={styles.chartsText}>World charts · what&apos;s rising today</ThemedText>
              <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
            </Pressable>
            <ThemedText type="eyebrow" style={styles.section}>
              What people are talking about
            </ThemedText>
            {talked.length === 0 ? (
              <ThemedText style={styles.note}>No conversations yet. Reveal a song and start one.</ThemedText>
            ) : (
              talked.map(({ track, count }) => (
                <SongRow key={track.id} track={track} detail={`${count} comment${count === 1 ? '' : 's'}`} onPress={() => openSong(track)} />
              ))
            )}
          </>
        )}

        {results && !loading && (
          <>
            {results.artists.length > 0 && (
              <>
                <ThemedText type="eyebrow" style={styles.section}>
                  Artists
                </ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
                  {results.artists.map((a) => (
                    <Pressable
                      key={a.id}
                      style={styles.artist}
                      onPress={() => router.push({ pathname: '/songs', params: { id: String(a.id), kind: 'artist', title: a.name } })}>
                      <Image source={{ uri: artworkUrl(a.artworkUrl, 300) }} style={styles.artistArt} />
                      <ThemedText style={styles.cap} numberOfLines={1}>
                        {a.name}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            {results.songs.length > 0 && (
              <>
                <ThemedText type="eyebrow" style={styles.section}>
                  Songs
                </ThemedText>
                {results.songs.map((t) => (
                  <SongRow key={t.id} track={t} detail={t.artistName} onPress={() => openSong(t)} />
                ))}
              </>
            )}
            {results.albums.length > 0 && (
              <>
                <ThemedText type="eyebrow" style={styles.section}>
                  Albums
                </ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
                  {results.albums.map((a) => (
                    <Pressable
                      key={a.id}
                      style={styles.album}
                      onPress={() => router.push({ pathname: '/songs', params: { id: String(a.id), kind: 'album', title: a.title } })}>
                      <Image source={{ uri: artworkUrl(a.artworkUrl, 300) }} style={styles.albumArt} />
                      <ThemedText style={styles.cap} numberOfLines={1}>
                        {a.title}
                      </ThemedText>
                      <ThemedText style={styles.capDim} numberOfLines={1}>
                        {a.artist}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            {results.songs.length === 0 && <ThemedText style={styles.note}>Nothing found. Try the artist&apos;s name.</ThemedText>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SongRow({ track, detail, onPress }: { track: DiscoveryTrack; detail: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Image source={{ uri: artworkUrl(track.artworkUrl100, 200) }} style={styles.rowArt} />
      <View style={styles.rowText}>
        <ThemedText style={styles.rowTitle} numberOfLines={1}>
          {track.trackName}
        </ThemedText>
        <ThemedText style={styles.capDim} numberOfLines={1}>
          {detail}
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.lg, paddingHorizontal: Spacing.md },
  input: { flex: 1, color: Colors.text, fontFamily: Fonts.sans, fontSize: 16, paddingVertical: Spacing.md },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  section: { marginTop: Spacing.xl, marginBottom: Spacing.sm },
  chartsLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginTop: Spacing.lg },
  chartsText: { flex: 1, fontFamily: 'Figtree_600SemiBold' },
  note: { fontFamily: Fonts.note, fontSize: 20, lineHeight: 24, color: Colors.textSecondary, marginTop: Spacing.sm },
  hRow: { gap: Spacing.md },
  artist: { width: 96, alignItems: 'center', gap: 6 },
  artistArt: { width: 96, height: 96, borderRadius: Radius.round },
  album: { width: 130, gap: 2 },
  albumArt: { width: 130, height: 130, borderRadius: Radius.md },
  cap: { fontFamily: 'Figtree_700Bold', fontSize: 14, lineHeight: 18 },
  capDim: { fontSize: 13, lineHeight: 17, color: Colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  rowArt: { width: 56, height: 56, borderRadius: Radius.sm },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: 'Figtree_700Bold', fontSize: 16, lineHeight: 20, letterSpacing: -0.2 },
});
