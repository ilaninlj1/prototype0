import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Tabs } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View, type ViewInstance } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { oceanDive, onDiveSettled, setOceanTabBarHeight, useDivePan, useOceanInk } from '@/components/ocean/dive-gesture';
import { onSaveLanded, setSaveTabTarget } from '@/components/save-flight';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { useDailyDrop } from '@/hooks/use-daily-drop';
import { useHomeChromeVisible } from '@/hooks/use-home-chrome';
import { tabBarScrollHidden } from '@/hooks/use-scroll-chrome';
import { onDecodedNews } from '@/hooks/use-taste-decoded';
import { FADE_MS, tabBarVisible } from '@/lib/home-chrome';
import { showsAt } from '@/lib/ocean-dive';
import { checkPeopleNews, onPeopleNews } from '@/lib/people-api';
import { tabBarRoom, tabBarScrollShare } from '@/lib/scroll-chrome';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// Over Home's water the bar has no background of its own, so it needs ink that reads on the water.
const WATER_INK = {
  dark: { active: '#06222b', idle: 'rgba(4,30,40,0.74)', indicator: '#06222b' },
  light: { active: '#ffffff', idle: 'rgba(255,255,255,0.78)', indicator: '#ffffff' },
};

// Outline when idle, filled when active — one icon family, two states.
const ICONS: Record<string, { idle: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap; label: string }> = {
  index: { idle: 'headset-outline', active: 'headset', label: 'Home' },
  play: { idle: 'game-controller-outline', active: 'game-controller', label: 'Play' },
  people: { idle: 'people-outline', active: 'people', label: 'People' },
  library: { idle: 'albums-outline', active: 'albums', label: 'Library' },
  explore: { idle: 'ear-outline', active: 'ear', label: 'You' },
};

const INDICATOR = 22;

/**
 * Edge to edge under a thin rule; a short black bar springs to the active tab.
 * On Home it fades with Home's buttons (lib/home-chrome.ts); on the other tabs
 * it slides away while you scroll down a list (lib/scroll-chrome.ts) and gives
 * its room to the list, so you see more covers. On Home it keeps its height
 * and floats on the water, which runs behind it to the bottom of the phone:
 * a tap still switches tabs, and a drag up dives (components/ocean/dive-gesture.ts).
 */
export function BlindspotTabBar({ state, emitter, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [tabWidth, setTabWidth] = useState(0);
  const x = useSharedValue(0);
  const focusedName = state.routes[state.index]?.name ?? '';

  const placed = useRef(false);
  useEffect(() => {
    if (!tabWidth) return;
    const target = state.index * tabWidth + (tabWidth - INDICATOR) / 2;
    // Snap into place on first layout; spring on every tab change after.
    x.set(placed.current ? withSpring(target, { damping: 18, stiffness: 220 }) : target);
    placed.current = true;
  }, [state.index, tabWidth, x]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  const shown = tabBarVisible(focusedName, useHomeChromeVisible());
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(reduceMotion ? (shown ? 1 : 0) : withTiming(shown ? 1 : 0, { duration: FADE_MS }));
  }, [shown, reduceMotion, opacity]);
  // Home's fade and the scroll slide multiply; tabBarScrollShare keeps the scroll out of it on Home.
  const height = useSharedValue(0);
  const onHome = focusedName === 'index';
  const fade = useAnimatedStyle(() => {
    const away = tabBarScrollShare(onHome ? 'index' : 'other', tabBarScrollHidden.get());
    const diving = onHome ? showsAt(oceanDive.get()).tabBar : 1;
    // The negative margin slides it down and hands its room to the screen above, which grows into it.
    return {
      opacity: opacity.get() * diving * Math.min(1, Math.max(0, 1 - away * 1.2)),
      marginBottom: tabBarRoom(height.get(), away) - height.get(),
      // On Home the screen reaches behind the bar, so the water can run to the bottom of the phone.
      marginTop: onHome ? -height.get() : 0,
    };
  });
  const divePan = useDivePan(onHome);
  const waterInk = WATER_INK[useOceanInk()];
  const [under, setUnder] = useState(false);
  useEffect(() => onDiveSettled(setUnder), []);

  // A save on Home lands on Library: the icon bumps, and a +N stays until you open it.
  const libraryRef = useRef<ViewInstance>(null);
  const bump = useSharedValue(1);
  const [newSaves, setNewSaves] = useState(0);
  if (focusedName === 'library' && newSaves > 0) setNewSaves(0);
  useEffect(
    () =>
      onSaveLanded(() => {
        bump.set(withSequence(withSpring(1.35, { damping: 6, stiffness: 320 }), withSpring(1, { damping: 12, stiffness: 200 })));
        setNewSaves((n) => n + 1);
      }),
    [bump]
  );
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.get() }] }));
  useEffect(() => {
    setSaveTabTarget((done) =>
      libraryRef.current?.measureInWindow((x, y, w, h) => {
        if (w > 0) done({ x: x + w / 2, y: y + h / 2 });
      })
    );
    return () => setSaveTabTarget(null);
  }, []);

  // A Taste Decoded finding nobody has opened puts a dot on You (hooks/use-taste-decoded.ts).
  const [decodedNews, setDecodedNews] = useState(false);
  if (focusedName === 'explore' && decodedNews) setDecodedNews(false);
  useEffect(() => onDecodedNews(() => setDecodedNews(true)), []);

  const [peopleNews, setPeopleNews] = useState(false);
  if (focusedName === 'people' && peopleNews) setPeopleNews(false);
  useEffect(() => onPeopleNews(setPeopleNews), []);

  // Today's Daily Drop, not played yet: a dot on Play (it used to be a ring on Home).
  const daily = useDailyDrop();
  useEffect(() => {
    daily.refresh();
    void checkPeopleNews();
    // Checked again on every tab change, the way the ring checked on Home's focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.index]);
  const dropWaiting = !!daily.drop && !(!daily.active && daily.guess != null);

  function onLayout(e: LayoutChangeEvent) {
    setTabWidth(e.nativeEvent.layout.width / state.routes.length);
  }

  const usable = shown && !(onHome && under);
  const bar = (
    <Animated.View
      onLayout={(e) => {
        height.set(e.nativeEvent.layout.height);
        setOceanTabBarHeight(e.nativeEvent.layout.height);
      }}
      style={[styles.wrap, onHome && styles.wrapOnWater, { paddingBottom: Math.max(insets.bottom, Spacing.md) }, fade]}
      pointerEvents={usable ? 'auto' : 'none'}
      accessibilityElementsHidden={!usable}
      importantForAccessibility={usable ? 'auto' : 'no-hide-descendants'}>
      <View style={styles.bar} onLayout={onLayout}>
        {tabWidth > 0 && <Animated.View style={[styles.indicator, onHome && { backgroundColor: waterInk.indicator }, indicator]} />}
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const icon = ICONS[route.name] ?? { idle: 'ellipse-outline', active: 'ellipse', label: route.name };
          const color = onHome ? (focused ? waterInk.active : waterInk.idle) : focused ? Colors.text : Colors.textSecondary;
          const glyph = <Ionicons name={focused ? icon.active : icon.idle} size={24} color={color} />;
          const badge =
            route.name === 'library' && newSaves > 0 && !focused ? (
              <View style={styles.count}>
                <ThemedText style={styles.countText}>+{newSaves}</ThemedText>
              </View>
            ) : (route.name === 'explore' && decodedNews) || (route.name === 'play' && dropWaiting) ||
                (route.name === 'people' && peopleNews) ? (
              !focused && <View style={styles.dot} />
            ) : null;
          return (
            <Pressable
              key={route.key}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={route.name === 'library' && newSaves > 0 ? `${icon.label}, ${newSaves} new` : icon.label}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigateToTab(route.key);
              }}>
              {route.name === 'library' ? (
                <Animated.View ref={libraryRef} style={bumpStyle}>
                  {glyph}
                  {badge}
                </Animated.View>
              ) : (
                <View>
                  {glyph}
                  {badge}
                </View>
              )}
              <ThemedText style={[styles.label, { color }]}>{icon.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
  return <GestureDetector gesture={divePan}>{bar}</GestureDetector>;
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.rule },
  wrapOnWater: { backgroundColor: 'transparent', borderTopColor: 'transparent' },
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
    backgroundColor: Colors.text,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  dot: { position: 'absolute', top: -1, right: -5, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.signal },
  count: { position: 'absolute', top: -6, right: -14, paddingHorizontal: 5, borderRadius: 9, backgroundColor: Colors.signal },
  countText: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: Colors.accentText },
  label: { fontSize: 12, lineHeight: 15, fontWeight: '600' },
});
