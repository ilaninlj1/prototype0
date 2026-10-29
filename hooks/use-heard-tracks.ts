import { useEffect, useMemo, useState } from 'react';

import type { DiscoveryTrack } from '@/lib/discovery';
import { catalogTrackById } from '@/lib/pool';
import { lookupTracks } from '@/lib/song-details';

// Heard rows only know a song's id and name; the cover and preview come from the bundled catalog,
// then iTunes (150 ids a lookup), and stay cached for the session.
const cache = new Map<number, DiscoveryTrack | null>();
const BATCH = 150;

/** Full tracks for these ids, filled in as they resolve. A song iTunes no longer has stays missing. */
export function useHeardTracks(ids: number[], known: DiscoveryTrack[]): Map<number, DiscoveryTrack> {
  const [version, setVersion] = useState(0);
  const key = ids.join(',');

  // Saved and bundled songs resolve at once; only the rest need the network.
  const missing = useMemo(() => {
    for (const t of known) if (!cache.get(t.id)) cache.set(t.id, t);
    return ids.filter((id) => {
      if (cache.has(id)) return false;
      const fromCatalog = catalogTrackById(id);
      if (fromCatalog) cache.set(id, fromCatalog);
      return !fromCatalog;
    });
    // `known` only seeds the cache; the ids decide when to look again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (missing.length === 0) return;
    let live = true;
    (async () => {
      for (let i = 0; i < missing.length && live; i += BATCH) {
        const batch = missing.slice(i, i + BATCH);
        const found = await lookupTracks(batch).catch(() => [] as DiscoveryTrack[]);
        const byId = new Map(found.map((t) => [t.id, t]));
        for (const id of batch) cache.set(id, byId.get(id) ?? null);
        if (live) setVersion((v) => v + 1);
      }
    })();
    return () => {
      live = false;
    };
  }, [missing]);

  return useMemo(() => {
    const out = new Map<number, DiscoveryTrack>();
    for (const id of ids) {
      const t = cache.get(id);
      if (t) out.set(id, t);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version, missing]);
}
