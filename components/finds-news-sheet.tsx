import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { MiniPlayer } from '@/components/mini-player';
import { ThemedText } from '@/components/themed-text';
import { BottomSheet, SheetHeader } from '@/components/ui/sheet';
import { Colors, Radius, Spacing } from '@/constants/theme';
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
    <BottomSheet visible={visible} onClose={handleClose}>
      <SheetHeader title="While you were gone" onDone={handleClose} />
      <View style={styles.sheet}>

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
                    color={Colors.text}
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
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  list: {
    maxHeight: 360,
  },
  listContent: {
    gap: Spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 60,
    paddingVertical: Spacing.xs,
  },
  art: {
    width: 52,
    height: 52,
    borderRadius: Radius.lg,
  },
  itemText: {
    flex: 1,
  },
  sentence: {
    fontSize: 15,
    lineHeight: 20,
    color: Colors.text,
  },
  playerWrap: {
    marginTop: Spacing.xs,
    marginHorizontal: -Spacing.md,
  },
});
