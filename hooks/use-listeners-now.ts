import { useEffect, useState } from 'react';

import { loadListenersNow, saveListenersNow } from '@/lib/discovery-storage';
import { fetchArtistListeners } from '@/lib/pool';

const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

/**
 * Today's Last.fm listener count for each artist, filled in as lookups land.
 * Cached for 12h so reopening the Liked list or Profile doesn't refetch.
 */
export function useListenersNow(artistNames: string[]): Record<string, number> {
  const [now, setNow] = useState<Record<string, number>>({});
  const key = [...new Set(artistNames)].sort().join('\n');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cache = await loadListenersNow();
      const names = key ? key.split('\n') : [];
      const fresh = (name: string) => cache[name] && Date.now() - cache[name].fetchedAt < STALE_AFTER_MS;

      const known: Record<string, number> = {};
      for (const name of names) if (cache[name]) known[name] = cache[name].listeners;
      if (!cancelled) setNow(known);

      for (const name of names.filter((n) => !fresh(n))) {
        const listeners = await fetchArtistListeners(name);
        if (cancelled) return;
        if (listeners == null) continue;
        cache[name] = { listeners, fetchedAt: Date.now() };
        setNow((prev) => ({ ...prev, [name]: listeners }));
        await saveListenersNow(cache);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return now;
}
