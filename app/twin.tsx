import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppleMusicLink, CreditLine } from '@/components/credits';
import { LikeButton } from '@/components/like-button';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { artworkUrl, type DiscoveryTrack } from '@/lib/discovery';
import { handleUrl, type Platform } from '@/lib/twins';
import { block, fetchHandle, fetchTwinSongs, report, wave } from '@/lib/twins-api';

const PLATFORM_NAME: Record<Platform, string> = { instagram: 'Instagram', snapchat: 'Snapchat', tiktok: 'TikTok' };

/** One taste twin: what you share, what else they saved, and a wave that swaps handles when it's mutual. */
export default function TwinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ id: string; name: string; percent: string; summary: string; iWaved: string; theyWaved: string; canWave: string }>();
  const { player, status } = usePlayback();
  const [songs, setSongs] = useState<{ shared: DiscoveryTrack[]; theirs: DiscoveryTrack[] } | null>(null);
  const [iWaved, setIWaved] = useState(p.iWaved === 'true');
  const theyWaved = p.theyWaved === 'true';
  const canWave = p.canWave === 'true';
  const [contact, setContact] = useState<{ handle: string; platform: Platform } | null | undefined>(undefined);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    fetchTwinSongs(p.id).then(setSongs);
  }, [p.id]);

  const mutual = canWave && iWaved && theyWaved;
  useEffect(() => {
    if (mutual) fetchHandle(p.id).then(setContact);
  }, [mutual, p.id]);

  useFocusEffect(useCallback(() => () => player.pause(), [player]));

  function toggle(t: DiscoveryTrack) {
    if (playingId === t.id && status.playing) {
      player.pause();
      return;
    }
    player.replace(t.previewUrl);
    player.play();
    setPlayingId(t.id);
  }

  async function sayHi() {
    if (await wave(p.id)) setIWaved(true);
    else setNote('Couldn’t wave just now. Try again.');
  }

  function confirmBlock() {
    Alert.alert(`Block ${p.name}?`, 'They won’t see you and you won’t see them.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          if (await block(p.id)) router.back();
          else setNote('Couldn’t block just now. Try again.');
        },
      },
    ]);
  }

  function chooseReport() {
    const send = (reason: string) => async () => {
      setNote((await report(p.id, reason)) ? 'Reported. Three reports hide a profile.' : 'Couldn’t report just now. Try again.');
    };
    Alert.alert(`Report ${p.name}`, 'What’s wrong?', [
      { text: 'Fake or spam', onPress: send('fake or spam') },
      { text: 'Offensive name', onPress: send('offensive name') },
      { text: 'Something else', onPress: send('other') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const row = (t: DiscoveryTrack) => (
    <View key={t.id} style={styles.row}>
      <Pressable onPress={() => toggle(t)} style={styles.artWrap}>
        <Image source={{ uri: artworkUrl(t.artworkUrl100, 200) }} style={styles.art} />
        <View style={styles.playBadge}>
          <Ionicons name={playingId === t.id && status.playing ? 'pause' : 'play'} size={14} color={Colors.accentText} />
        </View>
      </Pressable>
      <View style={styles.rowText}>
        <ThemedText style={styles.rowTitle} numberOfLines={1}>
          {t.trackName}
        </ThemedText>
        <ThemedText style={styles.dim} numberOfLines={1}>
          {t.artistName}
        </ThemedText>
        <View style={styles.links}>
          <LikeButton track={t} size={18} />
          <AppleMusicLink trackId={t.id} url={t.trackViewUrl} height={24} />
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl }]}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="chevron-back" size={26} color={Colors.text} />
      </Pressable>
      <ThemedText type="eyebrow">Taste twin</ThemedText>
      <View style={styles.head}>
        <ThemedText type="title" style={styles.name} numberOfLines={2}>
          {p.name}
        </ThemedText>
        <ThemedText style={styles.percent}>{p.percent}%</ThemedText>
      </View>
      <ThemedText style={styles.dim}>{p.summary}</ThemedText>

      {canWave && (
        <View style={styles.waveBox}>
          {mutual ? (
            contact === undefined ? (
              <ActivityIndicator color={Colors.text} />
            ) : contact ? (
              <View style={styles.contact}>
                <ThemedText style={styles.contactText}>
                  @{contact.handle} on {PLATFORM_NAME[contact.platform]}
                </ThemedText>
                <PressableScale style={styles.primary} onPress={() => Linking.openURL(handleUrl(contact.platform, contact.handle))}>
                  <ThemedText style={styles.primaryText}>Open</ThemedText>
                </PressableScale>
              </View>
            ) : (
              <ThemedText style={styles.dim}>You both waved. They didn’t share a handle.</ThemedText>
            )
          ) : iWaved ? (
            <ThemedText style={styles.dim}>
              {theyWaved ? 'You both waved.' : 'Waved. If they wave back, you’ll see each other’s handle.'}
            </ThemedText>
          ) : (
            <>
              {theyWaved && <ThemedText style={styles.wavedAtYou}>{p.name} waved at you.</ThemedText>}
              <PressableScale style={styles.primary} onPress={sayHi}>
                <Ionicons name="hand-right-outline" size={18} color={Colors.accentText} />
                <ThemedText style={styles.primaryText}>{theyWaved ? 'Wave back' : 'Wave'}</ThemedText>
              </PressableScale>
            </>
          )}
        </View>
      )}
      {!!note && <ThemedText style={styles.dim}>{note}</ThemedText>}

      {songs === null ? (
        <ActivityIndicator color={Colors.text} style={styles.spinner} />
      ) : (
        <>
          {songs.shared.length > 0 && (
            <>
              <ThemedText type="eyebrow" style={styles.section}>
                You both liked, blind
              </ThemedText>
              {songs.shared.map(row)}
            </>
          )}
          {songs.theirs.length > 0 && (
            <>
              <ThemedText type="eyebrow" style={styles.section}>
                Also in their saves
              </ThemedText>
              {songs.theirs.map(row)}
            </>
          )}
          {songs.shared.length + songs.theirs.length === 0 && <ThemedText style={styles.dim}>Their songs didn’t load. Try again in a minute.</ThemedText>}
        </>
      )}

      <View style={styles.footer}>
        <Pressable onPress={confirmBlock} hitSlop={8}>
          <ThemedText style={styles.link}>Block</ThemedText>
        </Pressable>
        <Pressable onPress={chooseReport} hitSlop={8}>
          <ThemedText style={styles.link}>Report</ThemedText>
        </Pressable>
      </View>
      <CreditLine lastfm={false} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  back: { alignSelf: 'flex-start', marginBottom: Spacing.sm },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.md },
  name: { flex: 1 },
  percent: { fontFamily: Fonts.display, fontSize: 32, lineHeight: 36, color: Colors.signal },
  dim: { color: Colors.textSecondary },
  spinner: { marginTop: Spacing.xl },
  waveBox: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm, marginTop: Spacing.md },
  wavedAtYou: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.highlight },
  contact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  contactText: { flex: 1, fontFamily: 'Figtree_700Bold', fontSize: 16 },
  primary: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl },
  primaryText: { fontFamily: 'Figtree_700Bold', color: Colors.accentText },
  section: { marginTop: Spacing.xl, marginBottom: Spacing.xs },
  row: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center', paddingVertical: 6 },
  artWrap: { width: 56, height: 56 },
  art: { width: 56, height: 56, borderRadius: Radius.sm },
  playBadge: { position: 'absolute', right: 4, bottom: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 1 },
  rowTitle: { fontFamily: 'Figtree_700Bold', fontSize: 15, lineHeight: 19 },
  links: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, marginTop: 2 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xl },
  link: { color: Colors.textSecondary, textDecorationLine: 'underline' },
});
