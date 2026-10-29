import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { useCalledShots } from '@/hooks/use-called-shots';
import { useListenersNow } from '@/hooks/use-listeners-now';
import type { DiscoveryTrack } from '@/lib/discovery';
import {
  loadLikedTracks,
  loadNewsSeen,
  loadReleaseChecks,
  saveNewsSeen,
  type NewsSeenState,
  type ReleaseChecks,
} from '@/lib/discovery-storage';
import { bottleNews, markBottlesSeen } from '@/lib/bottle-journey';
import type { Bottle } from '@/lib/bottle-rows';
import { loadBottleSeen, loadBottlesOn, myBottles, updateSeen } from '@/lib/bottles-api';
import { buildFindsNews, markNewsSeen, type FindsNewsItem } from '@/lib/finds-news';
import { syncReleaseChecks } from '@/lib/finds-news-api';

export function useFindsNews() {
  const [liked, setLiked] = useState<DiscoveryTrack[]>([]);
  const [newsSeen, setNewsSeen] = useState<NewsSeenState>({});
  const [releaseChecks, setReleaseChecks] = useState<ReleaseChecks>({});
  // Where your bottles went since you last looked (only with Bottles on; never signs anyone up otherwise).
  const [bottleItems, setBottleItems] = useState<FindsNewsItem[]>([]);
  const bottlesRef = useRef<Bottle[]>([]);
  const { calls } = useCalledShots();

  const artistNames = useMemo(() => {
    return [...new Set([...liked.map((t) => t.artistName), ...calls.map((c) => c.artistName)])];
  }, [liked, calls]);

  const listenersNow = useListenersNow(artistNames);

  const reload = useCallback(async () => {
    const [l, s, r] = await Promise.all([
      loadLikedTracks(),
      loadNewsSeen(),
      loadReleaseChecks(),
    ]);
    setLiked(l);
    setNewsSeen(s);
    setReleaseChecks(r);
    if ((await loadBottlesOn()) !== true) return;
    const [mine, seen] = await Promise.all([myBottles(null), loadBottleSeen()]);
    if (!mine) return;
    bottlesRef.current = mine;
    const byId = new Map(l.map((t) => [t.id, t]));
    setBottleItems(
      bottleNews(mine, seen, (id) => byId.get(id)?.trackName ?? null).flatMap((n) => {
        const t = byId.get(n.trackId);
        return t ? [{ id: n.id, type: 'bottle' as const, artistName: t.artistName, artistId: t.artistId, track: t, sentence: n.sentence, called: false }] : [];
      })
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const news = useMemo(() => {
    return buildFindsNews({
      likedTracks: liked,
      newsSeen,
      releaseChecks,
      listenersNow,
      calls,
      bottleItems,
    });
  }, [liked, newsSeen, releaseChecks, listenersNow, calls, bottleItems]);


  const dismissNews = useCallback(async () => {
    if (news.length === 0) return;
    const nextSeen = markNewsSeen(newsSeen, news, listenersNow);
    setNewsSeen(nextSeen);
    await saveNewsSeen(nextSeen);
    if (bottleItems.length > 0) {
      setBottleItems([]);
      await updateSeen((seen) => markBottlesSeen(seen, bottlesRef.current));
    }
  }, [news, newsSeen, listenersNow, bottleItems]);

  // Once per app open, and only after saved songs have loaded.
  const syncedRef = useRef(false);
  const syncReleases = useCallback(async () => {
    if (syncedRef.current || liked.length === 0) return;
    syncedRef.current = true;
    const updated = await syncReleaseChecks(liked);
    setReleaseChecks(updated);
  }, [liked]);

  return {
    news,
    dismissNews,
    syncReleases,
  };
}
