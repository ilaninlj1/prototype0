import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { MiniPlayer } from '@/components/mini-player';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing, Ui } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { artworkUrl, type DiscoveryTrack } from '@/lib/discovery';
import type { FindsNewsItem } from '@/lib/finds-news';

type FindsNewsSheetProps = {
  visible: boolean;
  items: FindsNewsItem[];
  /** played: a news song took over the player, so Home should bring its card back. */
  onClose: (played: boolean) => void;
};

/** Sheet listing what happened to your saved artists since you last looked. */
export function FindsNewsSheet({ visible, items, onClose }: FindsNewsSheetProps) {
  const { player, status } = usePlayback();
  const [playingTrack, setPlayingTrack] = useState<DiscoveryTrack | null>(null);

  function handlePlay(track: DiscoveryTrack) {
    if (playingTrack?.id === track.id) {
      if (status.playing) player.pause();
      else player.play();
      return;
    }
    player.replace(track.previewUrl);
    player.play();
    setPlayingTrack(track);
  }

  function handleClose() {
    const played = playingTrack != null;
    if (played) player.pause();
    setPlayingTrack(null);
    onClose(played);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <ThemedText style={Ui.label}>While you were gone</ThemedText>
            <TouchableOpacity onPress={handleClose} style={Ui.textButton} hitSlop={8} accessibilityRole="button">
              <ThemedText style={[Ui.label, styles.doneText]}>Done</ThemedText>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {items.map((item) => {
              const isPlaying = playingTrack?.id === item.track.id && status.playing;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.itemRow}
                  activeOpacity={0.7}
                  onPress={() => handlePlay(item.track)}
                  accessibilityRole="button"
                  accessibilityLabel={item.sentence}>
                  <Image source={{ uri: artworkUrl(item.track.artworkUrl100, 200) }} style={styles.art} />
                  <View style={styles.itemText}>
                    <ThemedText style={styles.sentence}>{item.sentence}</ThemedText>
                  </View>
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={20}
                    color={isPlaying ? Colors.signal : Colors.textSecondary}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {playingTrack && (
            <View style={styles.playerWrap}>
              <MiniPlayer
                track={playingTrack}
                playing={status.playing}
                progress={status.duration ? status.currentTime / status.duration : 0}
                onToggle={() => handlePlay(playingTrack)}
              />
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.hairline,
    borderTopLeftRadius: Radius.md,
    borderTopRightRadius: Radius.md,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  doneText: {
    color: Colors.textSecondary,
  },
  list: {
    maxHeight: 320,
  },
  listContent: {
    gap: Spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  art: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
  },
  itemText: {
    flex: 1,
  },
  sentence: {
    fontSize: 14,
    lineHeight: 19,
    color: Colors.text,
  },
  playerWrap: {
    marginTop: Spacing.xs,
  },
});
