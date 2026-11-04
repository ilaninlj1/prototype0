import { useCallback, useEffect, useRef, useState } from 'react';
import { runOnJS, useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue } from 'react-native-reanimated';

import { oceanDive } from '@/components/ocean/dive-gesture';
import type { SkyLook } from '@/lib/home-sky';
import { emptyScene, sceneAt, type SeaLifeKind, type Sighting } from '@/lib/sea-life';
import { colorsFor, isFar, makeSighting, nextGap, pickKind, stillPlan, type SeaLifeColors } from '@/lib/sea-life-plan';

type Where = { width: number; screenH: number; horizon: number; hour: number; look: SkyLook };
type Options = Where & {
  active: boolean;
  /** Under the water: nothing new comes up. */
  paused: boolean;
  /** The buttons have faded and the song is playing: the sea wakes up. */
  still: boolean;
};
export type ShowOptions = { breach?: boolean; leap?: boolean; quick?: boolean };

/** One animal at a time in this slot. Nothing draws while it's empty. */
function useSeaSlot(active: boolean, where: React.RefObject<Where>) {
  const [sighting, setSighting] = useState<Sighting | null>(null);
  const [colors, setColors] = useState<SeaLifeColors | null>(null);
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
      const l = where.current;
      if (l.width <= 0) return;
      const s = makeSighting(kind, { width: l.width, screenH: l.screenH, horizon: l.horizon, hour: l.hour, wind: l.look.weather.wind, forceBreach: o.breach, forceLeap: o.leap, quick: o.quick });
      setColors(colorsFor(s, l.look));
      t.set(0);
      current.set(s);
      running.set(true);
      setSighting(s);
    },
    [t, current, running, where]
  );

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
export type SeaSlot = ReturnType<typeof useSeaSlot>;

/**
 * Rare while you swipe. Leave a song alone until the buttons fade and more come up, smallest and closest first, ending
 * with a whale. Staying on a song is the only sign of liking it while it's still blind. With reduced motion none come up
 * on their own.
 */
export function useSeaLife({ active, paused, still, width, screenH, horizon, hour, look }: Options) {
  const reduced = useReducedMotion();
  const where = useRef<Where>({ width, screenH, horizon, hour, look });
  useEffect(() => {
    where.current = { width, screenH, horizon, hour, look };
  }, [width, screenH, horizon, hour, look]);
  const far = useSeaSlot(active, where);
  const near = useSeaSlot(active, where);
  const showFar = far.show;
  const showNear = near.show;
  const show = useCallback(
    (kind: SeaLifeKind, o: ShowOptions = {}) => {
      if (isFar(kind)) showFar(kind, o);
      else showNear(kind, o);
    },
    [showFar, showNear]
  );
  const busy = useRef({ far: false, near: false });
  useEffect(() => {
    busy.current = { far: !!far.sighting, near: !!near.sighting };
  }, [far.sighting, near.sighting]);
  const bringUp = useCallback(
    (kind: SeaLifeKind, o: ShowOptions = {}) => {
      // Whatever's up finishes first: this step just doesn't happen.
      if (isFar(kind) ? busy.current.far : busy.current.near) return;
      busy.current[isFar(kind) ? 'far' : 'near'] = true;
      show(kind, o);
    },
    [show]
  );

  const can = active && !paused && !reduced;

  // Swiping: one every minute or two.
  const [rareTick, setRareTick] = useState(0);
  useEffect(() => {
    if (!can || still) return;
    const id = setTimeout(() => {
      bringUp(pickKind(where.current.hour, Math.random));
      setRareTick((n) => n + 1);
    }, nextGap(Math.random) * 1000);
    return () => clearTimeout(id);
  }, [can, still, bringUp, rareTick]);

  // Still: the sea wakes up on its order, and a tap or swipe calls off whatever hasn't come up yet.
  useEffect(() => {
    if (!can || !still) return;
    const ids = stillPlan(where.current.hour, Math.random).map((step) => setTimeout(() => bringUp(step.kind, { quick: step.quick }), step.at * 1000));
    return () => ids.forEach(clearTimeout);
  }, [can, still, bringUp]);

  return { far, near, show };
}
