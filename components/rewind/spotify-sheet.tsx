import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { Linking, Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing, Ui } from '@/constants/theme';

/**
 * Before the first Spotify songs come in: what they bring, what they don't touch, and the two
 * ways in. A file from exportify.app works for anyone; the login only for the test list.
 */
export function SpotifySheet({
  visible,
  onConnect,
  onImport,
  onClose,
}: {
  visible: boolean;
  onConnect: () => void;
  onImport: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ThemedText style={Ui.label}>Spotify</ThemedText>
          <ThemedText type="subtitle">Bring in your Spotify songs</ThemedText>
          <ThemedText style={styles.text}>
            Every song you&apos;ve liked or added to a playlist, on the day you saved it. They stay apart from what you found
            blind, and nothing leaves your phone.
          </ThemedText>

          <View style={styles.way}>
            <ThemedText style={styles.wayTitle}>Import a file · works for anyone</ThemedText>
            <ThemedText style={styles.step}>
              1. Open{' '}
              <ThemedText style={styles.linkText} onPress={() => Linking.openURL('https://exportify.app')}>
                exportify.app
              </ThemedText>{' '}
              and log in with Spotify.
            </ThemedText>
            <ThemedText style={styles.step}>2. Tap Export next to Liked Songs, or Export All for every playlist.</ThemedText>
            <ThemedText style={styles.step}>3. Come back, tap Import a file, and pick what it saved.</ThemedText>
            <ThemedText style={styles.small}>
              Files also unlock your Spotify stats on You, and Home stops showing you artists you already have.
            </ThemedText>
            <TouchableOpacity onPress={onImport} style={[Ui.outlineButton, styles.button]}>
              <Ionicons name="document-outline" size={16} color={Colors.text} />
              <ThemedText style={Ui.label}>Import a file</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.way}>
            <ThemedText style={styles.wayTitle}>Or log in · test list only</ThemedText>
            <ThemedText style={styles.small}>Spotify only lets 5 accounts on this app&apos;s test list log in.</ThemedText>
            <TouchableOpacity onPress={onConnect} style={[Ui.outlineButton, styles.button]}>
              <FontAwesome name="spotify" size={16} color={Colors.text} />
              <ThemedText style={Ui.label}>Connect Spotify</ThemedText>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onClose} style={[Ui.textButton, styles.cancelRow]}>
            <ThemedText style={[Ui.label, styles.cancel]}>Cancel</ThemedText>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.55)', padding: Spacing.lg },
  sheet: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
  text: { fontSize: 15, lineHeight: 21 },
  way: { gap: 6, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.rule },
  wayTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  step: { fontSize: 14, lineHeight: 19, color: Colors.textSecondary },
  linkText: { fontSize: 14, color: Colors.text, textDecorationLine: 'underline' },
  small: { fontSize: 13, lineHeight: 18, color: Colors.textTertiary },
  button: { alignSelf: 'flex-start', marginTop: Spacing.xs },
  cancelRow: { alignSelf: 'flex-end' },
  cancel: { color: Colors.textSecondary },
});
