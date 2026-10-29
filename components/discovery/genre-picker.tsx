import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomSheet, SheetHeader } from '@/components/ui/sheet';
import { Colors, Fonts, Spacing, TapTarget, Ui } from '@/constants/theme';
import { buildGenreSections, pickableGenres, searchGenres, type GenreSection } from './genre-taxonomy';

type GenrePickerProps = {
  curatedGenres: string[];
  discoveredGenres: string[];
  /** strategy.type === 'genre' ? strategy.genre : null — drives scroll-to/highlight. */
  currentGenre: string | null;
  /** Trigger button text — the current genre, or "More from: X" for an artist strategy. */
  currentLabel: string;
  onSelect: (genre: string) => void;
  onExplore: () => void;
  /** Told every time the sheet opens or closes (Home keeps its buttons up while a sheet is open). */
  onOpenChange?: (open: boolean) => void;
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
  currentGenre,
  currentLabel,
  onSelect,
  onExplore,
  onOpenChange,
}: GenrePickerProps) {
  const [visible, setVisibleState] = useState(false);
  const setVisible = (open: boolean) => {
    setVisibleState(open);
    onOpenChange?.(open);
  };
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const scrollRef = useRef<ScrollViewInstance>(null);
  const rowOffsets = useRef(new Map<string, number>());
  const scrolledForRef = useRef<string | null>(null);

  const sections = useMemo(
    () => buildGenreSections(curatedGenres, discoveredGenres),
    [curatedGenres, discoveredGenres]
  );

  function close() {
    setVisible(false);
    setQuery('');
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
          <ThemedText style={[styles.rowText, indented && styles.childText, isCurrent && styles.onCream]}>{genre}</ThemedText>
          {isCurrent && <Ionicons name="checkmark" size={18} color={Colors.accentText} />}
        </ThemedView>
      </TouchableOpacity>
    );
  }

  function renderGroup(section: GroupSection) {
    const isOpen = expanded.has(section.label);
    const isCurrent = section.genre !== null && section.genre === currentGenre;
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
            </TouchableOpacity>
          <TouchableOpacity
            onPress={() => toggleGroup(section.label)}
            activeOpacity={0.7}
            style={styles.chevronTap}
            accessibilityRole="button"
            accessibilityState={{ expanded: isOpen }}
            accessibilityLabel={`${isOpen ? 'Hide' : 'Show'} ${section.label} styles`}>
            <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={18} color={isCurrent ? Colors.accentText : Colors.textSecondary} />
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
        <Ionicons name="chevron-down" size={16} color={Colors.text} />
      </TouchableOpacity>

      <BottomSheet visible={visible} onClose={close} maxHeight="80%">
        <SheetHeader title={`${pickableGenres(sections).length} genres`} onDone={close} />
        <ScrollView ref={scrollRef} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={explore} activeOpacity={0.7} style={styles.exploreButton} accessibilityRole="button">
            <Ionicons name="shuffle" size={18} color={Colors.accentText} />
            <ThemedText style={styles.exploreText}>Shuffle: explore somewhere new</ThemedText>
          </TouchableOpacity>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={Colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Find a genre"
              placeholderTextColor={Colors.textSecondary}
              autoCorrect={false}
              style={styles.searchInput}
              accessibilityLabel="Find a genre"
            />
          </View>
          {query.trim()
            ? (() => {
                const hits = searchGenres(sections, query);
                return hits.length > 0 ? hits.map((g) => renderRow(g, false)) : <ThemedText style={styles.none}>No genre called “{query.trim()}”.</ThemedText>;
              })()
            : sections.map((section) => (section.type === 'leaf' ? renderRow(section.genre, false) : renderGroup(section)))}
        </ScrollView>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  // A light pill: the genre you're in, at the top left of Home.
  trigger: {
    maxWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    borderRadius: TapTarget / 2,
    backgroundColor: Colors.surface,
  },
  triggerText: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    flexShrink: 1,
  },
  list: {
    paddingBottom: Spacing.xl,
  },
  exploreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: Colors.accent,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
  },
  exploreText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.accentText },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TapTarget,
    borderRadius: TapTarget / 2,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  searchInput: { flex: 1, minHeight: TapTarget, color: Colors.text, fontFamily: Fonts.sans, fontSize: 16 },
  none: { fontSize: 15, color: Colors.textSecondary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
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
  // The chosen genre is a black pill.
  rowCurrent: {
    marginHorizontal: Spacing.sm,
    paddingHorizontal: Spacing.xl - Spacing.sm,
    borderRadius: TapTarget / 2,
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
  rowText: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    lineHeight: 22,
    color: Colors.text,
  },
  childText: {
    fontSize: 16,
    color: Colors.text,
  },
});
