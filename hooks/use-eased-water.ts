import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { easeOfSky, mixWater, SKY_FADE_MS } from '@/lib/home-sky';

const STEP_MS = 100;

/**
 * Colors that fade with the sky instead of snapping to the next song's. They step about ten times a second, and only
 * while a fade is running, so a settled sea costs nothing. A new song in the middle of a fade carries on from where it is.
 */
export function useEasedWater<T extends Record<string, unknown>>(target: T): T {
  const reduced = useReducedMotion();
  const [now, setNow] = useState(target);
  const shown = useRef(target);
  const key = JSON.stringify(target);
  useEffect(() => {
    if (reduced) {
      shown.current = target;
      setNow(target);
      return;
    }
    const from = shown.current;
    // Nothing to fade, so nothing redraws.
    if (JSON.stringify(from) === key) return;
    const started = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / SKY_FADE_MS);
      const next = mixWater(from, target, easeOfSky(t));
      shown.current = next;
      setNow(next);
      if (t >= 1) clearInterval(id);
    }, STEP_MS);
    return () => clearInterval(id);
    // The target's contents, not its identity, say whether anything changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);
  return now;
}

/** A switch that happens partway through the fade, when either side reads about as well. */
export function useDelayedValue<T>(value: T, ms: number): T {
  const reduced = useReducedMotion();
  const [now, setNow] = useState(value);
  useEffect(() => {
    if (value === now) return;
    if (reduced) {
      setNow(value);
      return;
    }
    const id = setTimeout(() => setNow(value), ms);
    return () => clearTimeout(id);
  }, [value, now, ms, reduced]);
  return now;
}
