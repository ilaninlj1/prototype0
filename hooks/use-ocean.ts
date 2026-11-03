import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { onLikeChange } from '@/components/like-button';
import { songLight } from '@/hooks/use-bottles';
import { loadLikedTracks } from '@/lib/discovery-storage';
import type { DiscoveryTrack, SwipeEntry } from '@/lib/discovery';
import type { Depth } from '@/lib/ocean-map';
import { buildOcean, type OceanLife } from '@/lib/ocean-person';
import { catalogTrackById, deckPool, depthOfTrack } from '@/lib/pool';
import { soundFor } from '@/lib/sound-index';
import { soundLookup } from '@/lib/sound-lookup-app';

/** After Home has settled: the first build reads the whole catalog once, so it waits until nothing else is happening. */
const WARM_MS = 2000;

const colors = new Map<number, string>();
function colorOf(id: number): string {
  let c = colors.get(id);
  if (!c) {
    c = songLight(id);
    colors.set(id, c);
  }
  return c;
}
function soundOf(id: number) {
  const indexed = soundFor(id);
  if (indexed) return indexed;
  const cached = soundLookup.peek(id);
  return cached?.status === 'measured' ? cached.features : null;
}
function depthOf(t: DiscoveryTrack | SwipeEntry): Depth {
  return 'trackId' in t ? depthOfTrack({ id: t.trackId, artistListeners: t.artistListeners, trackRank: t.trackRank } as DiscoveryTrack) : depthOfTrack(t);
}

/**
 * This person's ocean: rebuilt when their history or Library changes, never during a drag (the build only starts
 * after the swipe that caused it has settled). Null until the first build.
 */
export function useOcean(history: SwipeEntry[]): OceanLife | null {
  const [life, setLife] = useState<OceanLife | null>(null);
  const [liked, setLiked] = useState<DiscoveryTrack[] | null>(null);
  const [warm, setWarm] = useState(false);
  const historyRef = useRef(history);
  historyRef.current = history;

  useEffect(() => {
    const t = setTimeout(() => {
      catalogTrackById(0);
      deckPool();
      setWarm(true);
    }, WARM_MS);
    return () => clearTimeout(t);
  }, []);

  const reload = useCallback(() => {
    void loadLikedTracks().then(setLiked);
  }, []);
  useFocusEffect(reload);
  useEffect(() => onLikeChange(() => reload()), [reload]);

  useEffect(() => {
    if (!warm || !liked) return;
    const t = setTimeout(() => {
      setLife(buildOcean({ history: historyRef.current, liked, soundOf, depthOf, colorOf, now: Date.now() }));
    }, 250);
    return () => clearTimeout(t);
  }, [warm, liked, history]);

  return life;
}
