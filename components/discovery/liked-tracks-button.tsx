import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type LikedTracksButtonProps = {
  onPress: () => void;
};

/** Persistent bottom-right pill button — Undo and the genre picker already occupy the top corners. */
export function LikedTracksButton({ onPress }: LikedTracksButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.wrapper}>
      <ThemedView style={styles.button} lightColor="#2a2a2a" darkColor="#2a2a2a">
        <ThemedText style={styles.buttonText}>Liked</ThemedText>
      </ThemedView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    zIndex: 1,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
