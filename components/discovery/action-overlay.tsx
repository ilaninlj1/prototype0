import { useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const AUTO_DISMISS_MS = 4000;

type ActionOverlayProps = {
  visible: boolean;
  onArtist: () => void;
  onSound: () => void;
};

export function ActionOverlay({ visible, onArtist, onSound }: ActionOverlayProps) {
  const onSoundRef = useRef(onSound);
  onSoundRef.current = onSound;

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => onSoundRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <ThemedView style={styles.container} lightColor="transparent" darkColor="transparent">
      <TouchableOpacity onPress={onArtist} activeOpacity={0.7}>
        <ThemedView style={styles.button} lightColor="#0a7ea4" darkColor="#0a7ea4">
          <ThemedText style={styles.buttonText}>More from this artist</ThemedText>
        </ThemedView>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSound} activeOpacity={0.7}>
        <ThemedView style={styles.button} lightColor="#0a7ea4" darkColor="#0a7ea4">
          <ThemedText style={styles.buttonText}>More like this sound</ThemedText>
        </ThemedView>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
