import { Ionicons } from '@expo/vector-icons';
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
import { Colors, Radius, Spacing, TapTarget, Ui } from '@/constants/theme';
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

/**
 * Trigger button (shows where you are) + a grouped, scrollable genre list in
 * a bottom-sheet modal. The trigger is a plain flow element — positioning is
 * the caller's job (app/(tabs)/index.tsx's absolutely-positioned header
 * overlay, alongside UndoButton), not this component's.
 */
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
          backgroundColor={isCurrent ? Colors.accent : 'transparent'}>
          <ThemedText style={[styles.rowText, isCurrent && styles.onCream]}>{genre}</ThemedText>
          {heard && <ThemedText style={[styles.checkmark, isCurrent && styles.onCream]}>✓</ThemedText>}
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
          backgroundColor={isCurrent ? Colors.accent : 'transparent'}
          onLayout={section.genre ? (e) => registerRowOffset(section.genre as string, e) : undefined}>
          <TouchableOpacity
            onPress={() => (section.genre ? pick(section.genre) : toggleGroup(section.label))}
            activeOpacity={0.7}
            style={styles.groupLabelTap}>
            <ThemedText style={[styles.rowText, isCurrent && styles.onCream]}>{section.label}</ThemedText>
            {heard && <ThemedText style={[styles.checkmark, isCurrent && styles.onCream]}>✓</ThemedText>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => toggleGroup(section.label)} activeOpacity={0.7} style={styles.chevronTap}>
            <ThemedText style={[styles.chevron, isCurrent && styles.onCream]}>{isOpen ? '▾' : '▸'}</ThemedText>
          </TouchableOpacity>
        </ThemedView>
        {isOpen && section.children.map((child) => renderRow(child, true))}
      </ThemedView>
    );
  }

  return (
    <>
      <TouchableOpacity onPress={() => setVisible(true)} activeOpacity={0.6} style={[Ui.textButton, styles.trigger]} accessibilityLabel={`Genre: ${currentLabel}. Change genre`}>
        <ThemedText numberOfLines={1} style={styles.triggerText}>
          {currentLabel}
        </ThemedText>
        <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView ref={scrollRef} contentContainerStyle={styles.list}>
              <TouchableOpacity onPress={explore} activeOpacity={0.6} style={[Ui.outlineButton, styles.exploreButton]}>
                <Ionicons name="shuffle" size={14} color={Colors.text} />
                <ThemedText style={Ui.label}>Explore somewhere new</ThemedText>
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
    maxWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  triggerText: {
    ...Ui.label,
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  // Same sheet as Tune: flat navy under a thin rule.
  sheet: {
    maxHeight: '70%',
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.hairline,
    borderTopLeftRadius: Radius.md,
    borderTopRightRadius: Radius.md,
    overflow: 'hidden',
  },
  list: {
    paddingVertical: Spacing.sm,
  },
  exploreButton: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  leafRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TapTarget,
    paddingHorizontal: Spacing.xl,
  },
  rowIndented: {
    paddingLeft: Spacing.xxl + Spacing.md,
  },
  // The chosen genre is filled cream.
  rowCurrent: {
    marginHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
  },
  onCream: {
    color: Colors.accentText,
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
    minHeight: TapTarget,
  },
  chevronTap: {
    minHeight: TapTarget,
    minWidth: TapTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  chevron: {
    color: Colors.textTertiary,
    fontSize: 16,
  },
  rowText: {
    ...Ui.label,
    fontSize: 13,
  },
  checkmark: {
    color: Colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
});
