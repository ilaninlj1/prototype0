import { useMemo } from 'react';

import { buildPool, type PoolSong } from '@/lib/game-pool';
import { allCatalogs, seedListeners } from '@/lib/pool';

let cached: PoolSong[] | null = null;

/** The modes' song pool, built once per app run from the bundled catalogs. */
export function useGamePool(): PoolSong[] {
  return useMemo(() => (cached ??= buildPool(allCatalogs(), seedListeners())), []);
}
