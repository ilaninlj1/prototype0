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
import { allDecks, deckKey, deckLabel, type Deck } from '@/lib/decks';
import { hslToHex, keyHue } from '@/lib/print-recipe';
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
  /** What to swipe: a sound, a key or a tempo band instead of a genre (lib/decks.ts). */
  onPickDeck?: (deck: Deck) => void;
  /** Unheard songs left in each deck, by deckKey; asked when a deck tab opens. */
  countDecks?: () => Map<string, number>;
  /** Told every time the sheet opens or closes (Home keeps its buttons up while a sheet is open). */
  onOpenChange?: (open: boolean) => void;
};

type GroupSection = Extract<GenreSection, { type: 'group' }>;

type Tab = 'genres' | 'sound' | 'keys' | 'tempo';
const TABS: { key: Tab; label: string; intro: string }[] = [
  { key: 'genres', label: 'Genres', intro: '' },
  { key: 'sound', label: 'Sound', intro: 'Songs from every genre that sound this way. Blind, like always.' },
  { key: 'keys', label: 'Keys', intro: 'Every song in one key, colored like its print.' },
  { key: 'tempo', label: 'Tempo', intro: 'Songs in one BPM band: for running, studying, or a mood.' },
];

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
  onPickDeck,
  countDecks,
  onOpenChange,
}: GenrePickerProps) {
  const [tab, setTab] = useState<Tab>('genres');
  const [counts, setCounts] = useState<Map<string, number> | null>(null);
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

  function openTab(next: Tab) {
    setTab(next);
    if (next !== 'genres' && countDecks) setCounts(countDecks());
  }

  function pickDeck(deck: Deck) {
    close();
    onPickDeck?.(deck);
  }

  function renderDecks(kind: Deck['kind']) {
    const decks = allDecks().filter((d) => d.kind === kind);
    return (
      <View style={styles.deckGrid}>
        {decks.map((d) => {
          const left = counts?.get(deckKey(d));
          const none = left === 0;
          return (
            <TouchableOpacity
              key={deckKey(d)}
              onPress={() => pickDeck(d)}
              disabled={none}
              activeOpacity={0.7}
              style={[styles.deckChip, none && styles.deckNone]}
              accessibilityRole="button"
              accessibilityLabel={`${deckLabel(d)}, ${left === undefined ? '' : `${left} songs left`}`}>
              {d.kind === 'key' && <View style={[styles.keyDot, { backgroundColor: hslToHex(keyHue(d.key, d.mode), 0.62, 0.58) }]} />}
              <View style={styles.deckWords}>
                <ThemedText style={styles.deckLabel} numberOfLines={1}>
                  {deckLabel(d)}
                </ThemedText>
                {left !== undefined && <ThemedText style={styles.deckCount}>{none ? 'Nothing left' : `${left} songs`}</ThemedText>}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
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
        <SheetHeader title="What to swipe" onDone={close} />
        {onPickDeck && (
          <View style={styles.tabs} accessibilityRole="tablist">
            {TABS.map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => openTab(t.key)}
                style={[styles.tab, tab === t.key && styles.tabOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t.key }}>
                <ThemedText style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <ScrollView ref={scrollRef} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {tab !== 'genres' ? (
            <>
              <ThemedText style={styles.deckIntro}>{TABS.find((t) => t.key === tab)?.intro}</ThemedText>
              {renderDecks(tab === 'sound' ? 'sound' : tab === 'keys' ? 'key' : 'tempo')}
            </>
          ) : (
          <>
          <ThemedText style={styles.deckIntro}>{pickableGenres(sections).length} genres</ThemedText>
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
          </>
          )}
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
  tabs: { flexDirection: 'row', gap: 4, padding: 4, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, borderRadius: 22, backgroundColor: Colors.surface },
  tab: { flex: 1, minHeight: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: Colors.accent },
  tabText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.text },
  tabTextOn: { color: Colors.accentText },
  deckIntro: { fontSize: 13, color: Colors.textSecondary, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  deckGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  deckChip: { width: '48%', minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: 16, backgroundColor: Colors.surface },
  deckNone: { opacity: 0.45 },
  keyDot: { width: 14, height: 14, borderRadius: 7 },
  deckWords: { flex: 1 },
  deckLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.text },
  deckCount: { fontSize: 12, color: Colors.textSecondary },
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
