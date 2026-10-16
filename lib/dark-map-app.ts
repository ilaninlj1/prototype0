// The Dark Map from storage: history, saves, the last look and the sound cache, through lib/dark-map.ts lightMap.
// Home's MAP button and the map screen both read it, so they always show the same share.

import { lightMap, type MapView } from './dark-map';
import { loadLikedTracks, loadMapSeen, loadSwipeHistory } from './discovery-storage';
import { soundFor } from './sound-index';
import { loadSoundRecords } from './sound-lookup-app';
import { loadSoundMap, mapNeighbors, type Neighbor } from './sound-map';

let neighbors: Neighbor[] | null = null;

/** Everything the map shows, or null when the app has no map file. */
export async function loadMapView(): Promise<MapView | null> {
  const map = loadSoundMap();
  if (!map) return null;
  const [history, liked, seen, records] = await Promise.all([loadSwipeHistory(), loadLikedTracks(), loadMapSeen(), loadSoundRecords()]);
  return lightMap(
    map,
    history,
    liked.map((t) => t.id),
    seen,
    (id) => {
      const record = records[id];
      return record?.status === 'measured' ? record.features : null;
    },
    () => (neighbors ??= mapNeighbors(map, soundFor))
  );
}
