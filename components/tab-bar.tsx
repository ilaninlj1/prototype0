import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Tabs } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { onSaveLanded, setYouTabTarget } from '@/components/save-flight';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { onDecodedNews } from '@/hooks/use-taste-decoded';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// Outline when idle, filled when active — one icon family, two states.
const ICONS: Record<string, { idle: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap; label: string }> = {
  index: { idle: 'headset-outline', active: 'headset', label: 'HOME' },
  play: { idle: 'game-controller-outline', active: 'game-controller', label: 'PLAY' },
  explore: { idle: 'ear-outline', active: 'ear', label: 'YOU' },
};

const INDICATOR = 22;

/** Edge to edge under a thin rule; a short red bar springs to the active tab. */
export function BlindspotTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const [tabWidth, setTabWidth] = useState(0);
  const x = useSharedValue(0);

  const placed = useRef(false);
  useEffect(() => {
    if (!tabWidth) return;
    const target = state.index * tabWidth + (tabWidth - INDICATOR) / 2;
    // Snap into place on first layout; spring on every tab change after.
    x.set(placed.current ? withSpring(target, { damping: 18, stiffness: 220 }) : target);
    placed.current = true;
  }, [state.index, tabWidth, x]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  // A save on Home lands here (components/save-flight.tsx): the YOU icon
  // bumps, and a red dot stays until you open the tab to see it in your shape.
  const youRef = useRef<View>(null);
  const bump = useSharedValue(1);
  const [unseen, setUnseen] = useState(false);
  const youFocused = state.routes[state.index]?.name === 'explore';
  if (youFocused && unseen) setUnseen(false);
  useEffect(
    () =>
      onSaveLanded(() => {
        bump.set(withSequence(withSpring(1.35, { damping: 6, stiffness: 320 }), withSpring(1, { damping: 12, stiffness: 200 })));
        setUnseen(true);
      }),
    [bump]
  );
  // A Taste Decoded finding nobody has opened lights the same dot (hooks/use-taste-decoded.ts).
  useEffect(() => onDecodedNews(() => setUnseen(true)), []);
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.get() }] }));
  useEffect(() => {
    setYouTabTarget((done) =>
      youRef.current?.measureInWindow((x, y, w, h) => {
        if (w > 0) done({ x: x + w / 2, y: y + h / 2 });
      })
    );
    return () => setYouTabTarget(null);
  }, []);

  function onLayout(e: LayoutChangeEvent) {
    setTabWidth(e.nativeEvent.layout.width / state.routes.length);
  }

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
      <View style={styles.bar} onLayout={onLayout}>
        {tabWidth > 0 && <Animated.View style={[styles.indicator, indicator]} />}
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const icon = ICONS[route.name] ?? { idle: 'ellipse-outline', active: 'ellipse', label: route.name.toUpperCase() };
          return (
            <Pressable
              key={route.key}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={icon.label}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}>
              {route.name === 'explore' ? (
                <Animated.View ref={youRef} style={bumpStyle}>
                  <Ionicons name={focused ? icon.active : icon.idle} size={24} color={focused ? Colors.text : Colors.textTertiary} />
                  {unseen && !focused && <View style={styles.dot} />}
                </Animated.View>
              ) : (
                <Ionicons name={focused ? icon.active : icon.idle} size={24} color={focused ? Colors.text : Colors.textTertiary} />
              )}
              <ThemedText style={[styles.label, { color: focused ? Colors.text : Colors.textTertiary }]}>{icon.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.rule },
  bar: {
    flexDirection: 'row',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  indicator: {
    position: 'absolute',
    top: -1, // sits on the rule
    left: 0,
    width: INDICATOR,
    height: 2,
    backgroundColor: Colors.signal,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  // New saves waiting in your shape.
  dot: { position: 'absolute', top: -1, right: -5, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.signal },
  label: { fontFamily: Fonts.monoMedium, fontSize: 11, lineHeight: 14, letterSpacing: 1.2 },
});
