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
import { buildFindsNews, markNewsSeen } from '@/lib/finds-news';
import { syncReleaseChecks } from '@/lib/finds-news-api';

export function useFindsNews() {
  const [liked, setLiked] = useState<DiscoveryTrack[]>([]);
  const [newsSeen, setNewsSeen] = useState<NewsSeenState>({});
  const [releaseChecks, setReleaseChecks] = useState<ReleaseChecks>({});
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
    });
  }, [liked, newsSeen, releaseChecks, listenersNow, calls]);


  const dismissNews = useCallback(async () => {
    if (news.length === 0) return;
    const nextSeen = markNewsSeen(newsSeen, news, listenersNow);
    setNewsSeen(nextSeen);
    await saveNewsSeen(nextSeen);
  }, [news, newsSeen, listenersNow]);

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
