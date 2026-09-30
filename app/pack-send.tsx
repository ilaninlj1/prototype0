import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BlindPackEmblem } from '@/components/emblems';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { packable, packUrl } from '@/lib/blind-pack';
import { artworkUrl, type DiscoveryTrack } from '@/lib/discovery';
import { loadLikedTracks, loadSenderName, saveSenderName } from '@/lib/discovery-storage';

const PACK_SIZE = 5;
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL;

/** Pick 5 of your finds and send them as a blind link. */
export default function PackSendScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tracks, setTracks] = useState<DiscoveryTrack[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [name, setName] = useState('');

  useEffect(() => {
    (async () => {
      const [liked, saved] = await Promise.all([loadLikedTracks(), loadSenderName()]);
      setTracks([...liked].reverse().filter(packable));
      setName(saved);
    })();
  }, []);

  function toggle(id: number) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < PACK_SIZE ? [...cur, id] : cur));
  }

  async function send() {
    if (!WEB_URL || picked.length !== PACK_SIZE) return;
    const from = name.trim() || 'A friend';
    await saveSenderName(name.trim());
    const url = packUrl(WEB_URL, picked, from);
    await Share.share({ message: `Can you guess what I like? 5 songs, blind 🎧 ${url}` }).catch(() => {});
  }

  const ready = !!WEB_URL && picked.length === PACK_SIZE;

  return (
    <ScrollView contentContainerStyle={[styles.pad, { paddingTop: insets.top + Spacing.lg }]}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
        <Ionicons name="close" size={26} color={Colors.textSecondary} style={styles.close} />
      </TouchableOpacity>
      <BlindPackEmblem size={64} />
      <ThemedText type="eyebrow">Blind Pack · 5 songs</ThemedText>
      <ThemedText type="title">Send a Blind Pack</ThemedText>
      <ThemedText style={styles.dim}>
        Pick {PACK_SIZE} of your finds. Your friend hears them blind in their browser — no app needed — and sees how
        much your taste matches.
      </ThemedText>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Your name (shown to your friend)"
        placeholderTextColor={Colors.textTertiary}
        maxLength={30}
        style={styles.input}
      />

      {tracks.length === 0 ? (
        <ThemedText style={styles.dim}>Like some songs on Home or in the Daily Drop first.</ThemedText>
      ) : (
        tracks.map((t) => {
          const on = picked.includes(t.id);
          return (
            <TouchableOpacity key={t.id} onPress={() => toggle(t.id)} activeOpacity={0.8}>
              <ThemedView style={[styles.row, on && styles.rowOn]} backgroundColor={Colors.surface}>
                <Image source={{ uri: artworkUrl(t.artworkUrl100, 200) }} style={styles.art} />
                <View style={styles.info}>
                  <ThemedText style={styles.rowTitle} numberOfLines={1}>
                    {t.trackName}
                  </ThemedText>
                  <ThemedText numberOfLines={1} style={styles.dim}>
                    {t.artistName}
                  </ThemedText>
                </View>
                <ThemedText style={styles.check}>{on ? '✓' : ''}</ThemedText>
              </ThemedView>
            </TouchableOpacity>
          );
        })
      )}

      <TouchableOpacity onPress={send} disabled={!ready}>
        <ThemedView style={[styles.button, !ready && styles.disabled]} backgroundColor={Colors.accent}>
          <ThemedText type="label" style={{ color: Colors.accentText }}>
            {!WEB_URL ? 'Pack links are not set up yet' : `Send pack · ${picked.length}/${PACK_SIZE}`}
          </ThemedText>
        </ThemedView>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: Spacing.lg, gap: Spacing.md, flexGrow: 1, backgroundColor: Colors.background },
  close: { fontSize: 22, color: Colors.textSecondary },
  dim: { color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.surface,
    color: Colors.text,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 2, borderColor: 'transparent' },
  rowOn: { borderColor: Colors.accent },
  art: { width: 56, height: 56, borderRadius: Radius.sm },
  info: { flex: 1, gap: 1 },
  rowTitle: { fontFamily: 'Figtree_700Bold', fontSize: 16, lineHeight: 20, letterSpacing: -0.2 },
  check: { color: Colors.accent, fontSize: 20, fontWeight: '800', width: 24 },
  button: { paddingVertical: Spacing.md, borderRadius: Radius.pill, alignItems: 'center', marginTop: Spacing.md },
  disabled: { opacity: 0.4 },
});
