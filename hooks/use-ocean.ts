import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { onLikeChange } from '@/components/like-button';
import { songLight } from '@/hooks/use-bottles';
import { useListenersNow } from '@/hooks/use-listeners-now';
import { loadLikedTracks } from '@/lib/discovery-storage';
import type { DiscoveryTrack, SwipeEntry } from '@/lib/discovery';
import { driftWater, waterOf, type Depth, type Place } from '@/lib/ocean-map';
import { buildOcean, type OceanLife } from '@/lib/ocean-person';
import { catalogTrackById, deckPool, depthOfTrack } from '@/lib/pool';
import { recipeFor } from '@/lib/print-recipe';
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
/** A second color from the song's print, for its creature's markings. */
const accents = new Map<number, string>();
function accentOf(id: number): string {
  let c = accents.get(id);
  if (!c) {
    const rings = recipeFor(id, soundOf(id), null).rings;
    c = rings[1]?.color ?? rings[0]?.color ?? colorOf(id);
    accents.set(id, c);
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
  return useOceanData(history).life;
}

/** A pause this long in your swiping before the ocean catches up, so it never costs anything between quick swipes. */
const IDLE_MS = 2500;

export function useOceanData(history: SwipeEntry[], urgent = false): { life: OceanLife | null; liked: DiscoveryTrack[] } {
  const [life, setLife] = useState<OceanLife | null>(null);
  const [liked, setLiked] = useState<DiscoveryTrack[] | null>(null);
  const [warm, setWarm] = useState(false);
  const firstBuilt = useRef(false);
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

  // How many listeners each artist has today, which is what makes fish climb. Asked for the first time you go under,
  // not on every launch, and kept for 12 hours (the same lookups the Library uses).
  const [wantCounts, setWantCounts] = useState(false);
  if (urgent && !wantCounts) setWantCounts(true);
  const names = useMemo(() => (wantCounts && liked ? liked.map((t) => t.artistName) : []), [wantCounts, liked]);
  const counts = useListenersNow(names);
  const countsRef = useRef(counts);
  countsRef.current = counts;
  const [countsSettled, setCountsSettled] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setCountsSettled((n) => n + 1), 1500);
    return () => clearTimeout(t);
  }, [counts]);

  useEffect(() => {
    if (!warm || !liked) return;
    // Going under catches up at once, so a song you just saved is there when you arrive.
    const t = setTimeout(() => {
      setLife(buildOcean({ history: historyRef.current, liked, soundOf, depthOf, colorOf, accentOf, listenersNowOf: (artist) => countsRef.current[artist] ?? null, now: Date.now() }));
    }, urgent || !firstBuilt.current ? 0 : IDLE_MS);
    firstBuilt.current = true;
    return () => clearTimeout(t);
  }, [warm, liked, history, urgent, countsSettled]);

  return { life, liked: liked ?? [] };
}

/** Where a swipe's song lives, for your path through the ocean. Songs with no sound data have no place across it. */
export function oceanPlaceOfEntry(e: SwipeEntry): Place | null {
  const s = soundOf(e.trackId);
  return s ? { water: waterOf(s), depth: depthOf(e) } : null;
}

/** Where a song lives, by the same rules as its creature. */
export function oceanPlaceOf(track: DiscoveryTrack): Place {
  const s = soundOf(track.id);
  return { water: s ? waterOf(s) : driftWater(track.id), depth: depthOf(track) };
}
