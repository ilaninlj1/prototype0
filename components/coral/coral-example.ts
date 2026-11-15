import { addLink, emptyCoral } from '@/lib/coral';
import type { CoralSong, CoralState } from '@/lib/coral-types';
import { deckPool } from '@/lib/pool';

/** Six fictional joins, using real bundled clips. The screen keeps edits in memory. */
export function exampleCoral(colorOf: (id: number) => string): CoralState {
  const pool = deckPool().filter(({ track }) => !!track.previewUrl);
  const songs: CoralSong[] = [];
  const seen = new Set<number>();
  for (let i = 0; songs.length < 7 && i < pool.length; i++) {
    const { track } = pool[(i * 317) % pool.length];
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    songs.push({ trackId: track.id, trackName: track.trackName, artistName: track.artistName, previewUrl: track.previewUrl, color: colorOf(track.id) });
  }
  let state = emptyCoral();
  for (const [i, [a, b]] of [[0, 1], [1, 2], [1, 3], [2, 3], [4, 5], [5, 6]].entries()) {
    if (songs[a] && songs[b]) state = addLink(state, songs[a], songs[b], i === 3 ? 'cut' : 'fade', i + 1);
  }
  return state;
}
