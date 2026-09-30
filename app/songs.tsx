import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { artworkUrl, type DiscoveryTrack } from '@/lib/discovery';
import { songsOf } from '@/lib/song-details';
import { pickLesserKnown } from '@/lib/song-facts';

/** An artist's or album's songs. Artists get "hear 3 blind first". */
export default function SongsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, kind, title } = useLocalSearchParams<{ id: string; kind: 'artist' | 'album'; title: string }>();
  const [songs, setSongs] = useState<DiscoveryTrack[] | null>(null);

  useEffect(() => {
    songsOf(Number(id)).then(setSongs);
  }, [id]);

  function hearBlind() {
    if (!songs) return;
    const three = pickLesserKnown(songs, 3);
    router.push({ pathname: '/pack', params: { ids: three.map((t) => t.id).join(','), from: title, kind: 'artist' } });
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </Pressable>
        <ThemedText type="eyebrow">{kind === 'artist' ? 'Artist' : `Album${songs?.[0] ? ` · ${songs[0].artistName}` : ''}`}</ThemedText>
        <ThemedText type="title">{title}</ThemedText>

        {kind === 'artist' && songs && songs.length >= 3 && (
          <PressableScale onPress={hearBlind} style={styles.blind}>
            <View style={styles.blindText}>
              <ThemedText style={styles.blindTitle}>Hear 3 of their songs blind first</ThemedText>
              <ThemedText style={styles.blindSub}>Lesser-known ones, no names. Then see what you liked.</ThemedText>
            </View>
            <Ionicons name="headset" size={26} color={Colors.accentText} />
          </PressableScale>
        )}

        {!songs ? (
          <ActivityIndicator color={Colors.text} style={{ marginTop: Spacing.xl }} />
        ) : (
          songs.map((t, i) => (
            <Pressable key={t.id} style={styles.row} onPress={() => router.push({ pathname: '/song', params: { id: String(t.id) } })}>
              {kind === 'album' ? (
                <ThemedText style={styles.num}>{String(i + 1).padStart(2, '0')}</ThemedText>
              ) : (
                <Image source={{ uri: artworkUrl(t.artworkUrl100, 200) }} style={styles.art} />
              )}
              <View style={styles.text}>
                <ThemedText style={styles.rowTitle} numberOfLines={1}>
                  {t.trackName}
                </ThemedText>
                {kind === 'artist' && (
                  <ThemedText style={styles.dim} numberOfLines={1}>
                    {t.collectionName}
                  </ThemedText>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.xs },
  back: { alignSelf: 'flex-start', marginBottom: Spacing.sm },
  blind: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.accent, borderRadius: Radius.lg, padding: Spacing.lg, marginVertical: Spacing.lg },
  blindText: { flex: 1, gap: 2 },
  blindTitle: { fontFamily: Fonts.displayBold, fontSize: 17, lineHeight: 21, color: Colors.accentText },
  blindSub: { fontSize: 13, lineHeight: 17, color: Colors.accentText, opacity: 0.75 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  art: { width: 52, height: 52, borderRadius: Radius.sm },
  num: { fontFamily: Fonts.monoMedium, fontSize: 13, color: Colors.textTertiary, width: 24 },
  text: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: 'Figtree_700Bold', fontSize: 16, lineHeight: 20, letterSpacing: -0.2 },
  dim: { fontSize: 13, color: Colors.textSecondary },
});
