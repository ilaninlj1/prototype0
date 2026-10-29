import type { ReactNode } from 'react';
import { type DimensionValue, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LightRoom } from '@/components/dark-room';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing, TapTarget } from '@/constants/theme';

/** The corner of every light sheet and card, the same as Home's card. */
export const SHEET_RADIUS = 28;

/**
 * The one bottom sheet the core flow uses (Details, Tune, the genre picker,
 * Finds News): a dimmed backdrop that closes it, a white sheet with big round
 * top corners and a grabber. Always light, even over a dark room.
 */
export function BottomSheet({
  visible,
  onClose,
  maxHeight = '88%',
  children,
}: {
  visible: boolean;
  onClose: () => void;
  maxHeight?: DimensionValue;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <LightRoom>
        {/* The backdrop is a sibling behind the sheet, not its parent: a Pressable wrapped around the sheet's
            ScrollView took the touch on phones, so long sheets (Details) couldn't scroll. */}
        <View style={styles.root}>
          <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
          <View style={[styles.sheet, { maxHeight, paddingBottom: insets.bottom }]}>
            <View style={styles.grabber} />
            {children}
          </View>
        </View>
      </LightRoom>
    </Modal>
  );
}

/** A sheet's top line: a title on the left, Done on the right. */
export function SheetHeader({ title, onDone, doneLabel = 'Done' }: { title: string; onDone: () => void; doneLabel?: string }) {
  return (
    <View style={styles.header}>
      <ThemedText style={styles.title} numberOfLines={1}>
        {title}
      </ThemedText>
      <Pressable onPress={onDone} style={styles.done} accessibilityRole="button" hitSlop={6}>
        <ThemedText style={styles.doneText}>{doneLabel}</ThemedText>
      </Pressable>
    </View>
  );
}

export const sheetStyles = StyleSheet.create({
  /** A small grey heading inside a sheet. */
  heading: { fontFamily: Fonts.sansSemiBold, fontSize: 15, lineHeight: 20, color: Colors.text, marginTop: Spacing.lg },
  /** A light grey rounded block inside a sheet. */
  card: { backgroundColor: Colors.surface, borderRadius: 20, padding: Spacing.lg, gap: Spacing.sm },
  /** A pill-shaped segmented control: grey track, the chosen one black. */
  segment: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: TapTarget / 2, padding: 3 },
  segmentItem: {
    flex: 1,
    minHeight: TapTarget - 6,
    borderRadius: (TapTarget - 6) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  segmentOn: { backgroundColor: Colors.accent },
  segmentText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, lineHeight: 18, color: Colors.textSecondary },
  segmentTextOn: { color: Colors.accentText },
});

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    overflow: 'hidden',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.hairline,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    minHeight: TapTarget,
  },
  title: { fontFamily: Fonts.displayBold, fontSize: 21, lineHeight: 26, color: Colors.text, flexShrink: 1 },
  done: {
    minHeight: 36,
    paddingHorizontal: Spacing.lg,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.text },
});
