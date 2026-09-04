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
        <ThemedView style={styles.button} lightColor="#2a2a2a" darkColor="#2a2a2a">
          <ThemedText style={styles.buttonText}>More from this artist</ThemedText>
        </ThemedView>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSound} activeOpacity={0.7}>
        <ThemedView style={styles.button} lightColor="#1a1a1a" darkColor="#1a1a1a">
          <ThemedText style={styles.buttonText}>More like this sound</ThemedText>
        </ThemedView>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 8,
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