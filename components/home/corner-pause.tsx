import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { Colors } from '@/constants/theme';
import { useSkyInk } from '@/components/home/sky-ink';

/** Pause and play, on the card's top-left corner: a tap on the card itself now shows or hides Home's buttons. */
export function CornerPause({ paused, onPress }: { paused: boolean; onPress: () => void }) {
  const ink = useSkyInk();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={paused ? 'Play' : 'Pause'}
      style={({ pressed }) => [styles.button, { backgroundColor: ink.paper }, pressed && { opacity: 0.7 }]}>
      <Ionicons name={paused ? 'play' : 'pause'} size={16} color={Colors.text} style={paused && { marginLeft: 2 }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
