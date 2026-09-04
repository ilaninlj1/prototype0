import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type GenrePickerProps = {
  genres: string[];
  heardGenres: Set<string>;
  onSelect: (genre: string) => void;
};

/** Top-right trigger button + a flat, scrollable genre list in a bottom-sheet modal. */
export function GenrePicker({ genres, heardGenres, onSelect }: GenrePickerProps) {
  const [visible, setVisible] = useState(false);

  function pick(genre: string) {
    setVisible(false);
    onSelect(genre);
  }

  return (
    <>
      <TouchableOpacity onPress={() => setVisible(true)} activeOpacity={0.7} style={styles.trigger}>
        <ThemedView style={styles.triggerButton} lightColor="#2a2a2a" darkColor="#2a2a2a">
          <ThemedText style={styles.triggerText}>Genres</ThemedText>
        </ThemedView>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView contentContainerStyle={styles.list}>
              {genres.map((genre) => {
                const heard = heardGenres.has(genre);
                return (
                  <TouchableOpacity key={genre} onPress={() => pick(genre)} activeOpacity={0.7}>
                    <ThemedView style={styles.row} lightColor="#1a1a1a" darkColor="#1a1a1a">
                      <ThemedText style={[styles.rowText, heard && styles.rowTextHeard]}>{genre}</ThemedText>
                      {heard && <ThemedText style={styles.checkmark}>✓</ThemedText>}
                    </ThemedView>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1,
  },
  triggerButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  triggerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    maxHeight: '70%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  list: {
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  rowText: {
    color: '#fff',
    fontSize: 16,
  },
  rowTextHeard: {
    opacity: 0.5,
  },
  checkmark: {
    color: '#4cd964',
    fontSize: 16,
    fontWeight: '600',
  },
});
