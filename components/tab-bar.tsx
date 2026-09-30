import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Tabs } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// Outline when idle, filled when active — one icon family, two states.
const ICONS: Record<string, { idle: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap; label: string }> = {
  index: { idle: 'headset-outline', active: 'headset', label: 'HOME' },
  play: { idle: 'game-controller-outline', active: 'game-controller', label: 'PLAY' },
  explore: { idle: 'ear-outline', active: 'ear', label: 'YOU' },
};

const INDICATOR = 22;

/** A floating navy bar; a red marker springs to the active tab. */
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
              <Ionicons name={focused ? icon.active : icon.idle} size={24} color={focused ? Colors.text : Colors.textTertiary} />
              <ThemedText style={[styles.label, { color: focused ? Colors.text : Colors.textTertiary }]}>{icon.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: Colors.background, paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  bar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: INDICATOR,
    height: 3,
    borderRadius: Radius.round,
    backgroundColor: Colors.signal,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  label: { fontFamily: Fonts.monoMedium, fontSize: 11, lineHeight: 14, letterSpacing: 1.2 },
});
