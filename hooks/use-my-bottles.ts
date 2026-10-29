import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { Bottle } from '@/lib/bottle-rows';
import { loadBottlesOn, myBottles } from '@/lib/bottles-api';

/** The bottles you launched or kept, by song, refreshed when the screen comes into focus. Empty with Bottles off. */
export function useMyBottles(): Map<number, Bottle> {
  const [byTrack, setByTrack] = useState(() => new Map<number, Bottle>());
  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        if ((await loadBottlesOn()) !== true) return;
        const mine = await myBottles(null);
        if (!mine || !live) return;
        const next = new Map<number, Bottle>();
        for (const b of mine) if ((next.get(b.trackId)?.keeps ?? -1) < b.keeps) next.set(b.trackId, b);
        setByTrack(next);
      })();
      return () => {
        live = false;
      };
    }, [])
  );
  return byTrack;
}
