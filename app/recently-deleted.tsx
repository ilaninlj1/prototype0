import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { restoreLikes } from '@/components/like-button';
import { noteText } from '@/components/note-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing, Ui } from '@/constants/theme';
import { artworkUrl } from '@/lib/discovery';
import { clearRecentlyDeleted, loadRecentlyDeleted } from '@/lib/discovery-storage';
import type { DeletedSong } from '@/lib/saved-songs';

// Same as the Liked screen's: react-native-web's Alert.alert never calls back.
function confirmDialog(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function deletedOn(at: number): string {
  return new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Songs deleted from Liked wait here until you put them back or clear them for good. */
export default function RecentlyDeletedScreen() {
  const [loaded, setLoaded] = useState(false);
  const [songs, setSongs] = useState<DeletedSong[]>([]);

  const reload = useCallback(async () => {
    setSongs(await loadRecentlyDeleted());
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function restore(ids: number[]) {
    setSongs((prev) => prev.filter((d) => !ids.includes(d.track.id)));
    await restoreLikes(ids);
  }

  async function clearAll() {
    const ok = await confirmDialog(
      `Delete ${songs.length === 1 ? 'this song' : `these ${songs.length} songs`} for good?`,
      "You won't be able to get them back."
    );
    if (!ok) return;
    const ids = songs.map((d) => d.track.id);
    setSongs([]);
    await clearRecentlyDeleted(ids);
  }

  if (!loaded) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={Colors.accent} />
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <ThemedView style={styles.container}>
        {songs.length === 0 ? (
          <ThemedText style={styles.dim}>
            Nothing here. Songs you delete from Liked wait here, so you can put them back.
          </ThemedText>
        ) : (
          <>
            <ThemedText style={styles.dim}>Songs you delete wait here until you put them back.</ThemedText>
            <View style={styles.bulk}>
              <TouchableOpacity onPress={() => restore(songs.map((d) => d.track.id))} style={Ui.outlineButton}>
                <ThemedText style={Ui.label}>Restore all</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearAll} style={Ui.textButton}>
                <ThemedText style={[Ui.label, styles.dimLabel]}>Delete all for good</ThemedText>
              </TouchableOpacity>
            </View>
            {songs.map(({ track, deletedAt }) => (
              <View key={track.id} style={styles.row}>
                <Image source={{ uri: artworkUrl(track.artworkUrl100, 200) }} style={styles.art} />
                <View style={styles.text}>
                  <ThemedText style={styles.title} numberOfLines={1}>
                    {track.trackName}
                  </ThemedText>
                  <ThemedText style={styles.artist} numberOfLines={1}>
                    {track.artistName} · deleted {deletedOn(deletedAt)}
                  </ThemedText>
                  {track.note && (
                    <ThemedText style={noteText} numberOfLines={1}>
                      “{track.note}”
                    </ThemedText>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => restore([track.id])}
                  style={Ui.outlineButton}
                  accessibilityLabel={`Restore ${track.trackName}`}>
                  <ThemedText style={Ui.label}>Restore</ThemedText>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  container: { flex: 1, padding: Spacing.lg, gap: Spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dim: { color: Colors.textSecondary },
  dimLabel: { color: Colors.textSecondary },
  bulk: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  art: { width: 52, height: 52, borderRadius: Radius.sm, backgroundColor: Colors.surface },
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: 'Figtree_700Bold', fontSize: 15, lineHeight: 19 },
  artist: { fontSize: 13, lineHeight: 17, color: Colors.textSecondary },
});
