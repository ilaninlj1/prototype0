import { FontAwesome } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing, Ui } from '@/constants/theme';

/** Before the first Spotify login: what it brings in, what it doesn't touch, and who can use it. */
export function SpotifySheet({ visible, onConnect, onClose }: { visible: boolean; onConnect: () => void; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ThemedText style={Ui.label}>Spotify</ThemedText>
          <ThemedText type="subtitle">Bring in your Spotify likes</ThemedText>
          <ThemedText style={styles.text}>
            Rewind adds every song you&apos;ve liked on Spotify, on the day you liked it. They stay apart from what you found
            blind: they don&apos;t count as finds and don&apos;t join your shape. Nothing leaves your phone.
          </ThemedText>
          <ThemedText style={styles.small}>For now Spotify only lets accounts on this app&apos;s test list connect.</ThemedText>
          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={Ui.textButton}>
              <ThemedText style={[Ui.label, styles.cancel]}>Cancel</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={onConnect} style={Ui.outlineButton}>
              <FontAwesome name="spotify" size={16} color={Colors.text} />
              <ThemedText style={Ui.label}>Connect Spotify</ThemedText>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.55)', padding: Spacing.xl },
  sheet: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
  text: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18, color: Colors.textSecondary },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: Spacing.md, marginTop: Spacing.xs },
  cancel: { color: Colors.textSecondary },
});
