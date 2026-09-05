import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { buildGenreSections, type GenreSection } from './genre-taxonomy';

type GenrePickerProps = {
  curatedGenres: string[];
  discoveredGenres: string[];
  heardGenres: Set<string>;
  /** strategy.type === 'genre' ? strategy.genre : null — drives scroll-to/highlight. */
  currentGenre: string | null;
  /** Trigger button text — the current genre, or "More from: X" for an artist strategy. */
  currentLabel: string;
  onSelect: (genre: string) => void;
  onExplore: () => void;
};

type GroupSection = Extract<GenreSection, { type: 'group' }>;

/** Top-right trigger button (shows where you are) + a grouped, scrollable genre list in a bottom-sheet modal. */
export function GenrePicker({
  curatedGenres,
  discoveredGenres,
  heardGenres,
  currentGenre,
  currentLabel,
  onSelect,
  onExplore,
}: GenrePickerProps) {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);
  const rowOffsets = useRef(new Map<string, number>());
  const scrolledForRef = useRef<string | null>(null);

  const sections = useMemo(
    () => buildGenreSections(curatedGenres, discoveredGenres),
    [curatedGenres, discoveredGenres]
  );

  function close() {
    setVisible(false);
  }

  function pick(genre: string) {
    close();
    onSelect(genre);
  }

  function explore() {
    close();
    onExplore();
  }

  function toggleGroup(label: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  // Pre-expand the group containing the current genre (if it's a child, not a
  // parent — a parent's own row is already visible without expanding) whenever
  // the sheet opens, and reset scroll tracking when it closes.
  useEffect(() => {
    if (!visible) {
      scrolledForRef.current = null;
      return;
    }
    if (!currentGenre) return;
    const owner = sections.find(
      (s): s is GroupSection => s.type === 'group' && s.children.includes(currentGenre)
    );
    if (owner) {
      setExpanded((prev) => (prev.has(owner.label) ? prev : new Set(prev).add(owner.label)));
    }
  }, [visible, currentGenre, sections]);

  function registerRowOffset(genre: string, event: LayoutChangeEvent) {
    const y = event.nativeEvent.layout.y;
    rowOffsets.current.set(genre, y);
    if (visible && genre === currentGenre && scrolledForRef.current !== currentGenre) {
      scrolledForRef.current = currentGenre;
      // Deferred a frame so a just-expanded group's layout has settled.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
      });
    }
  }

  function renderRow(genre: string, indented: boolean) {
    const heard = heardGenres.has(genre);
    const isCurrent = genre === currentGenre;
    return (
      <TouchableOpacity
        key={genre}
        onPress={() => pick(genre)}
        activeOpacity={0.7}
        onLayout={(e) => registerRowOffset(genre, e)}>
        <ThemedView
          style={[styles.leafRow, indented && styles.rowIndented, isCurrent && styles.rowCurrent]}
          backgroundColor={Colors.surface}>
          <ThemedText type="label" style={styles.rowText}>
            {genre}
          </ThemedText>
          {heard && <ThemedText style={styles.checkmark}>✓</ThemedText>}
        </ThemedView>
      </TouchableOpacity>
    );
  }

  function renderGroup(section: GroupSection) {
    const isOpen = expanded.has(section.label);
    const isCurrent = section.genre !== null && section.genre === currentGenre;
    const heard = section.genre !== null && heardGenres.has(section.genre);
    return (
      <ThemedView key={section.label}>
        <ThemedView
          style={[styles.groupRow, isCurrent && styles.rowCurrent]}
          backgroundColor={Colors.surface}
          onLayout={section.genre ? (e) => registerRowOffset(section.genre as string, e) : undefined}>
          <TouchableOpacity
            onPress={() => (section.genre ? pick(section.genre) : toggleGroup(section.label))}
            activeOpacity={0.7}
            style={styles.groupLabelTap}>
            <ThemedText type="label" style={styles.rowText}>
              {section.label}
            </ThemedText>
            {heard && <ThemedText style={styles.checkmark}>✓</ThemedText>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => toggleGroup(section.label)} activeOpacity={0.7} style={styles.chevronTap}>
            <ThemedText style={styles.chevron}>{isOpen ? '▾' : '▸'}</ThemedText>
          </TouchableOpacity>
        </ThemedView>
        {isOpen && section.children.map((child) => renderRow(child, true))}
      </ThemedView>
    );
  }

  return (
    <>
      <TouchableOpacity onPress={() => setVisible(true)} activeOpacity={0.7} style={styles.trigger}>
        <ThemedView style={styles.triggerButton} backgroundColor={Colors.surfaceElevated}>
          <ThemedText type="label" numberOfLines={1} style={styles.triggerText}>
            {currentLabel}
          </ThemedText>
        </ThemedView>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView ref={scrollRef} contentContainerStyle={styles.list}>
              <TouchableOpacity onPress={explore} activeOpacity={0.7}>
                <ThemedView style={styles.exploreRow} backgroundColor={Colors.surface}>
                  <ThemedText type="label" style={styles.exploreText}>
                    🔀 Explore
                  </ThemedText>
                </ThemedView>
              </TouchableOpacity>
              {sections.map((section) =>
                section.type === 'leaf' ? renderRow(section.genre, false) : renderGroup(section)
              )}
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
    top: Spacing.lg,
    right: Spacing.lg,
    maxWidth: 200,
    zIndex: 1,
  },
  triggerButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
  },
  triggerText: {
    color: Colors.textSecondary,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    maxHeight: '70%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    overflow: 'hidden',
  },
  list: {
    paddingVertical: Spacing.sm,
  },
  exploreRow: {
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.xl,
  },
  exploreText: {
    color: Colors.accent,
    fontSize: 16,
  },
  leafRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.xl,
  },
  rowIndented: {
    paddingLeft: Spacing.xxl + Spacing.md,
  },
  rowCurrent: {
    backgroundColor: Colors.surfaceElevated,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  groupLabelTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md + 2,
  },
  chevronTap: {
    paddingVertical: Spacing.md + 2,
    paddingLeft: Spacing.md,
  },
  chevron: {
    color: Colors.textTertiary,
    fontSize: 16,
  },
  rowText: {
    fontSize: 16,
  },
  checkmark: {
    color: Colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
});
