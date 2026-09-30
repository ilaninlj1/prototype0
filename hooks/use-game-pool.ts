import { useMemo } from 'react';

import { buildPool, type PoolSong } from '@/lib/game-pool';
import { hideFromDiscovery, useAllowAi } from '@/lib/human-check-api';
import { allCatalogs, seedListeners } from '@/lib/pool';

let cached: PoolSong[] | null = null;

/** The modes' song pool, built once per app run from the bundled catalogs — minus AI acts unless AI music is on. */
export function useGamePool(): PoolSong[] {
  const allowAi = useAllowAi();
  return useMemo(() => {
    cached ??= buildPool(allCatalogs(), seedListeners());
    return allowAi ? cached : cached.filter((s) => !hideFromDiscovery(s.artist));
  }, [allowAi]);
}
