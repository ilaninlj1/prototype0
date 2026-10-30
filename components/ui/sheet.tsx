import { createContext, type ReactNode, useContext, useEffect } from 'react';
import { type DimensionValue, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, type SharedValue, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LightRoom } from '@/components/dark-room';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing, TapTarget } from '@/constants/theme';

/** The corner of every light sheet and card, the same as Home's card. */
export const SHEET_RADIUS = 28;

type Drag = { drop: SharedValue<number>; height: SharedValue<number>; close: () => void; reduceMotion: boolean };
const SheetDrag = createContext<Drag | null>(null);

/**
 * Pull the sheet down to close it: it follows the finger, and past a quarter of its height (at most 120 pt) or on a
 * flick it drops away; short of that it springs back. A new gesture each call, since one can't sit on two views.
 */
function dragToClose({ drop, height, close, reduceMotion }: Drag) {
  return Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      // Upward it barely gives.
      drop.set(e.translationY > 0 ? e.translationY : e.translationY * 0.15);
    })
    .onEnd((e) => {
      if (e.translationY > Math.min(120, height.get() * 0.25) || e.velocityY > 900) {
        drop.set(
          withTiming(height.get(), { duration: reduceMotion ? 0 : 180 }, (done) => {
            if (done) runOnJS(close)();
          })
        );
      } else drop.set(withSpring(0, { damping: 20, stiffness: 260 }));
    });
}

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
  const reduceMotion = useReducedMotion();
  const drop = useSharedValue(0);
  const height = useSharedValue(600);
  // Every opening starts with the sheet all the way up.
  useEffect(() => {
    if (visible) drop.set(0);
  }, [visible, drop]);
  const drag: Drag = { drop, height, close: onClose, reduceMotion };
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: Math.max(-12, drop.get()) }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, Math.max(0, drop.get()) / Math.max(1, height.get())) }));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* A Modal is its own window on Android, so gestures in it need their own root. */}
      <GestureHandlerRootView style={styles.root}>
        <LightRoom>
          {/* The backdrop is a sibling behind the sheet, not its parent: a Pressable wrapped around the sheet's
              ScrollView took the touch on phones, so long sheets (Details) couldn't scroll. */}
          <View style={styles.root}>
            <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
              <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
            </Animated.View>
            <Animated.View
              onLayout={(e) => height.set(e.nativeEvent.layout.height)}
              style={[styles.sheet, { maxHeight, paddingBottom: insets.bottom }, sheetStyle]}>
              {/* The grabber and the title bar pull the sheet down; the content under them keeps its own scrolling. */}
              <GestureDetector gesture={dragToClose(drag)}>
                <View style={styles.grabZone}>
                  <View style={styles.grabber} />
                </View>
              </GestureDetector>
              <SheetDrag.Provider value={drag}>{children}</SheetDrag.Provider>
            </Animated.View>
          </View>
        </LightRoom>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** A sheet's top line: a title on the left, Done on the right. */
export function SheetHeader({ title, onDone, doneLabel = 'Done' }: { title: string; onDone: () => void; doneLabel?: string }) {
  const drag = useContext(SheetDrag);
  const header = (
    <View style={styles.header}>
      <ThemedText style={styles.title} numberOfLines={1}>
        {title}
      </ThemedText>
      <Pressable onPress={onDone} style={styles.done} accessibilityRole="button" hitSlop={6}>
        <ThemedText style={styles.doneText}>{doneLabel}</ThemedText>
      </Pressable>
    </View>
  );
  return drag ? <GestureDetector gesture={dragToClose(drag)}>{header}</GestureDetector> : header;
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
  // A taller strip than the grabber itself, so it's easy to catch.
  grabZone: { alignItems: 'center', paddingTop: Spacing.sm, paddingBottom: Spacing.xs },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.hairline,
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
