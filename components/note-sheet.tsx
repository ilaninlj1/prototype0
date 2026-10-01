import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing, Ui } from '@/constants/theme';
import type { DiscoveryTrack } from '@/lib/discovery';
import { NOTE_MAX } from '@/lib/saved-songs';

type Props = {
  track: DiscoveryTrack | null;
  onSave: (track: DiscoveryTrack, text: string) => void;
  onClose: () => void;
};

/** Write, change or clear your own line about a saved song. */
export function NoteSheet({ track, onSave, onClose }: Props) {
  return (
    <Modal visible={track !== null} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          {/* Keyed by song, so the draft starts from that song's note each time. */}
          {track && <Editor key={track.id} track={track} onSave={onSave} onClose={onClose} />}
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Editor({ track, onSave, onClose }: Props & { track: DiscoveryTrack }) {
  const [draft, setDraft] = useState(track.note ?? '');

  function save(text: string) {
    onSave(track, text);
    onClose();
  }

  return (
    <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
      <ThemedText style={Ui.label}>Your note</ThemedText>
      <ThemedText style={styles.song} numberOfLines={1}>
        {track.trackName} · {track.artistName}
      </ThemedText>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Why you saved it, like “the bass at 0:40”"
        placeholderTextColor={Colors.textTertiary}
        maxLength={NOTE_MAX}
        multiline
        autoFocus
        style={[Ui.input, styles.input]}
        accessibilityLabel="Your note"
      />
      <View style={styles.actions}>
        {track.note ? (
          <TouchableOpacity onPress={() => save('')} style={Ui.textButton}>
            <ThemedText style={[Ui.label, styles.clear]}>Clear note</ThemedText>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        <View style={styles.right}>
          <TouchableOpacity onPress={onClose} style={Ui.textButton}>
            <ThemedText style={[Ui.label, styles.cancel]}>Cancel</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => save(draft)} style={Ui.outlineButton}>
            <ThemedText style={Ui.label}>Save</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Pressable>
  );
}

/** A saved song's note, in handwriting, as it shows under covers and in the player. */
export const noteText = { fontFamily: Fonts.note, fontSize: 18, lineHeight: 21, color: Colors.text } as const;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.55)', padding: Spacing.xl },
  sheet: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
  song: { color: Colors.textSecondary, fontSize: 14, lineHeight: 18 },
  input: { minHeight: 88, paddingTop: Spacing.md, textAlignVertical: 'top', marginTop: Spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.xs },
  right: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  clear: { color: Colors.textSecondary },
  cancel: { color: Colors.textSecondary },
});
