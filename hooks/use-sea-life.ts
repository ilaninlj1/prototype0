import { useCallback, useEffect, useRef, useState } from 'react';
import { runOnJS, useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue } from 'react-native-reanimated';

import { oceanDive } from '@/components/ocean/dive-gesture';
import type { SkyLook } from '@/lib/home-sky';
import { emptyScene, sceneAt, type SeaLifeKind, type Sighting } from '@/lib/sea-life';
import { colorsFor, makeSighting, nextGap, pickKind, type SeaLifeColors } from '@/lib/sea-life-plan';

type Options = { active: boolean; paused: boolean; width: number; screenH: number; horizon: number; hour: number; look: SkyLook };
export type ShowOptions = { breach?: boolean; leap?: boolean };

/**
 * One animal at a time, about every song or two, and only while Home is on screen. Nothing draws between sightings. With
 * reduced motion none come up on their own.
 */
export function useSeaLife({ active, paused, width, screenH, horizon, hour, look }: Options) {
  const reduced = useReducedMotion();
  const [sighting, setSighting] = useState<Sighting | null>(null);
  const [colors, setColors] = useState<SeaLifeColors | null>(null);
  const latest = useRef({ width, screenH, horizon, hour, look });
  useEffect(() => {
    latest.current = { width, screenH, horizon, hour, look };
  }, [width, screenH, horizon, hour, look]);

  const t = useSharedValue(0);
  const running = useSharedValue(false);
  const isActive = useSharedValue(active);
  const current = useSharedValue<Sighting | null>(null);
  useEffect(() => {
    isActive.set(active);
  }, [active, isActive]);

  const clear = useCallback(() => {
    current.set(null);
    setSighting(null);
  }, [current]);

  const show = useCallback(
    (kind: SeaLifeKind, o: ShowOptions = {}) => {
      const l = latest.current;
      if (l.width <= 0) return;
      const s = makeSighting(kind, { width: l.width, screenH: l.screenH, horizon: l.horizon, hour: l.hour, wind: l.look.weather.wind, forceBreach: o.breach, forceLeap: o.leap });
      setColors(colorsFor(s, l.look));
      t.set(0);
      current.set(s);
      running.set(true);
      setSighting(s);
    },
    [t, current, running]
  );

  useEffect(() => {
    if (!active || paused || reduced || sighting) return;
    const id = setTimeout(() => show(pickKind(latest.current.hour, Math.random)), nextGap(Math.random) * 1000);
    return () => clearTimeout(id);
  }, [active, paused, reduced, sighting, show]);

  useFrameCallback((f) => {
    if (!running.get() || !isActive.get() || oceanDive.get() >= 1) return;
    const s = current.get();
    if (!s) return;
    const next = t.get() + Math.min(f.timeSincePreviousFrame ?? 16, 100) / 1000;
    t.set(next);
    if (next > s.duration) {
      running.set(false);
      runOnJS(clear)();
    }
  });

  const scene = useDerivedValue(() => {
    const s = current.get();
    return s ? sceneAt(s, t.get()) : emptyScene();
  });
  return { sighting, colors, scene, show, t, running };
}
export type SeaLife = ReturnType<typeof useSeaLife>;
