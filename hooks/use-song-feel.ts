import { useEffect, useState } from 'react';

import type { DiscoveryTrack } from '@/lib/discovery';
import { measureMissing, peekFeels } from '@/lib/song-feel-api';
import type { SongFeel } from '@/lib/tasteform';

/** All 8 measurements per saved song, keyed by track id. Unmeasured ones are measured a couple at a time and fill in as they arrive. */
export function useSongFeel(tracks: DiscoveryTrack[]): Record<number, SongFeel> {
  const [feels, setFeels] = useState<Record<number, SongFeel>>(peekFeels);
  const key = tracks.map((t) => t.id).join('|');

  useEffect(() => {
    let cancelled = false;
    measureMissing(tracks, setFeels, () => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the track ids, compared by value
  }, [key]);

  return feels;
}
