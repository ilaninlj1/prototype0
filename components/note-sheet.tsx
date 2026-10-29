import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

import { LightRoom } from '@/components/dark-room';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing, TapTarget, Typography, Ui } from '@/constants/theme';
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
      <LightRoom>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.backdrop} onPress={onClose}>
            {/* Keyed by song, so the draft starts from that song's note each time. */}
            {track && <Editor key={track.id} track={track} onSave={onSave} onClose={onClose} />}
          </Pressable>
        </KeyboardAvoidingView>
      </LightRoom>
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
      <ThemedText style={styles.title}>Your note</ThemedText>
      <ThemedText style={styles.song} numberOfLines={1}>
        {track.trackName} · {track.artistName}
      </ThemedText>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Why you saved it, like “the bass at 0:40”"
        placeholderTextColor={Colors.textSecondary}
        maxLength={NOTE_MAX}
        multiline
        autoFocus
        style={[Ui.input, styles.input]}
        accessibilityLabel="Your note"
      />
      <View style={styles.actions}>
        {track.note ? (
          <TouchableOpacity onPress={() => save('')} style={Ui.textButton} accessibilityRole="button">
            <ThemedText style={[Ui.label, styles.clear]}>Clear note</ThemedText>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        <View style={styles.right}>
          <TouchableOpacity onPress={onClose} style={Ui.textButton} accessibilityRole="button">
            <ThemedText style={[Ui.label, styles.cancel]}>Cancel</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => save(draft)} style={styles.save} accessibilityRole="button">
            <ThemedText style={[Ui.label, styles.saveText]}>Save</ThemedText>
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
  backdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.35)', padding: Spacing.xl },
  sheet: { backgroundColor: Colors.background, borderRadius: 28, padding: Spacing.xl, gap: Spacing.sm },
  title: { ...Typography.subtitle, color: Colors.text },
  song: { color: Colors.textSecondary, fontSize: 14, lineHeight: 18 },
  input: { minHeight: 96, paddingTop: Spacing.md, textAlignVertical: 'top', marginTop: Spacing.xs, borderWidth: 0, borderRadius: 16, backgroundColor: Colors.surface },
  save: { minHeight: TapTarget, paddingHorizontal: Spacing.xl, borderRadius: TapTarget / 2, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: Colors.accentText },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.xs },
  right: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  clear: { color: Colors.textSecondary },
  cancel: { color: Colors.textSecondary },
});
