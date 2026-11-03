import * as Haptics from 'expo-haptics';
import { useMemo, useSyncExternalStore } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { makeMutable, runOnJS, withSpring, withTiming } from 'react-native-reanimated';

import { settleDive } from '@/lib/ocean-dive';

// The dive is shared: the sea and the tab bar can both start it, and Home, the canvas and the tab bar all read it.

/** 0 = at the surface, 1 = under the water. */
export const oceanDive = makeMutable(0);
/** How far the surface travels between the two, in points. Home sets it from its layout. */
export const oceanTravel = makeMutable(800);
/** With reduced motion nothing follows the finger: a dive just fades in. */
export const oceanReduced = makeMutable(false);

const SPRING = { damping: 26, stiffness: 170, mass: 0.9, overshootClamping: true };

type Listener = (under: boolean) => void;
const listeners = new Set<Listener>();

/** Called when a dive or a rise has come to rest. */
export function onDiveSettled(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function notifySettled(under: boolean) {
  for (const l of listeners) l(under);
}
function brokeTheSurface() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Runs to the surface or under, on any thread. */
export function settleDiveTo(target: 0 | 1, velocity = 0) {
  'worklet';
  const done = (finished?: boolean) => {
    'worklet';
    if (finished) runOnJS(notifySettled)(target === 1);
  };
  if (oceanReduced.get()) {
    oceanDive.set(withTiming(target, { duration: 220 }, done));
    return;
  }
  const travel = oceanTravel.get();
  oceanDive.set(withSpring(target, { ...SPRING, velocity: travel > 0 ? -velocity / travel : 0 }, done));
}

/** Back at the surface at once, for when Home loses focus: everyone who reads the dive hears about it. */
export function surfaceNow() {
  oceanDive.set(0);
  notifySettled(false);
}

/**
 * The drag that dives, from the water or the tab bar. Only a clear upward drag starts it, so a tap still lands and
 * a sideways swipe is left alone.
 */
export function useDivePan(enabled = true) {
  return useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetY(-14)
        .failOffsetX([-20, 20])
        .onStart(() => {
          runOnJS(brokeTheSurface)();
        })
        .onUpdate((e) => {
          if (oceanReduced.get()) return;
          const travel = oceanTravel.get();
          oceanDive.set(Math.max(0, Math.min(1, -e.translationY / (travel > 0 ? travel : 1))));
        })
        .onEnd((e) => {
          const target = oceanReduced.get() ? (e.translationY < -14 ? 1 : 0) : settleDive(oceanDive.get(), e.velocityY);
          settleDiveTo(target, e.velocityY);
        })
        .onFinalize((_e, success) => {
          // A drag the system took away (a sheet, a phone call) never leaves Home half slid.
          if (!success && oceanDive.get() > 0 && oceanDive.get() < 1) settleDiveTo(0);
        }),
    [enabled]
  );
}

/** The tab bar's height on Home, so Home can reach behind it without anything moving. */
let tabBarHeight = 0;
const heightListeners = new Set<() => void>();
export function setOceanTabBarHeight(h: number) {
  if (h === tabBarHeight) return;
  tabBarHeight = h;
  for (const l of heightListeners) l();
}
export function useOceanTabBarHeight(): number {
  return useSyncExternalStore(
    (l) => {
      heightListeners.add(l);
      return () => heightListeners.delete(l);
    },
    () => tabBarHeight
  );
}

/** Which ink the tab bar uses over Home's water: 'dark' on a bright water, 'light' on a dark one. */
export type WaterInk = 'dark' | 'light';
let ink: WaterInk = 'dark';
const inkListeners = new Set<() => void>();
export function setOceanInk(next: WaterInk) {
  if (next === ink) return;
  ink = next;
  for (const l of inkListeners) l();
}
export function useOceanInk(): WaterInk {
  return useSyncExternalStore(
    (l) => {
      inkListeners.add(l);
      return () => inkListeners.delete(l);
    },
    () => ink
  );
}
