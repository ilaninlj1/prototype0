import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  makeMutable,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { useScreenReader } from '@/hooks/use-screen-reader';
import { SCROLL_CHROME_START, scrollChromeStep, tooShortToHide } from '@/lib/scroll-chrome';

/** 0 = the tab bar is up, 1 = scrolled away. Written by the focused tab's scroll handler, read by the tab bar on the UI thread. */
export const tabBarScrollHidden = makeMutable(0);

/** Quick, with only a hair of overshoot. */
const SPRING = { damping: 24, stiffness: 320, mass: 0.7 };

function settle(target: SharedValue<number>, shown: boolean, instant: boolean) {
  'worklet';
  const to = shown ? 0 : 1;
  target.set(instant ? to : withSpring(to, SPRING));
}

/**
 * Hide-on-scroll for a screen's top bar and the tab bar (lib/scroll-chrome.ts).
 * Spread `scrollProps` on an Animated.ScrollView, give the overlaid top bar
 * `barStyle` and `onBarLayout`, and pad the content by the bar's height so
 * nothing shifts. `pinned` keeps everything up (a sheet, the keyboard, a
 * selection); so does a screen reader. Leaving the screen brings it all back.
 */
export function useScrollChrome({ pinned = false, tabBar = true }: { pinned?: boolean; tabBar?: boolean } = {}) {
  const reduceMotion = useReducedMotion();
  const screenReader = useScreenReader();
  const pin = pinned || screenReader;

  const hidden = useSharedValue(0);
  const state = useSharedValue(SCROLL_CHROME_START);
  const pinNow = useSharedValue(pin);
  const barHeight = useSharedValue(0);
  const sizes = useRef({ content: 0, viewport: 0 });

  const show = useCallback(() => {
    state.set({ ...state.get(), shown: true, anchorY: state.get().lastY });
    settle(hidden, true, reduceMotion);
    if (tabBar) settle(tabBarScrollHidden, true, reduceMotion);
  }, [state, hidden, reduceMotion, tabBar]);

  useEffect(() => {
    pinNow.set(pin);
    if (pin) show();
  }, [pin, pinNow, show]);

  // Coming back to a screen (or leaving it) always finds the bars up.
  useFocusEffect(
    useCallback(() => {
      show();
      return show;
    }, [show])
  );

  const onScroll = useAnimatedScrollHandler(
    {
      onScroll: (e) => {
        const prev = state.get();
        const next = scrollChromeStep(prev, {
          y: e.contentOffset.y,
          maxY: e.contentSize.height - e.layoutMeasurement.height,
          pinned: pinNow.get(),
        });
        if (next.shown !== prev.shown) {
          settle(hidden, next.shown, reduceMotion);
          if (tabBar) settle(tabBarScrollHidden, next.shown, reduceMotion);
        }
        state.set(next);
      },
    },
    [reduceMotion, tabBar]
  );

  // A list that shrinks below scrolling height (a filter, a search) gets no scroll event: check on size changes.
  const recheck = useCallback(() => {
    if (tooShortToHide(sizes.current.content, sizes.current.viewport)) show();
  }, [show]);
  const onContentSizeChange = useCallback(
    (_w: number, h: number) => {
      sizes.current.content = h;
      recheck();
    },
    [recheck]
  );
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      sizes.current.viewport = e.nativeEvent.layout.height;
      recheck();
    },
    [recheck]
  );

  const barStyle = useAnimatedStyle(() => {
    const h = hidden.get();
    return { opacity: Math.min(1, Math.max(0, 1 - h * 1.2)), transform: [{ translateY: -h * barHeight.get() }] };
  });
  const onBarLayout = useCallback((e: LayoutChangeEvent) => barHeight.set(e.nativeEvent.layout.height), [barHeight]);

  return {
    scrollProps: { onScroll, scrollEventThrottle: 16, onContentSizeChange, onLayout },
    barStyle,
    onBarLayout,
  };
}
