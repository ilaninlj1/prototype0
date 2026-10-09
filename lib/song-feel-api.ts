import type { DiscoveryTrack } from './discovery';
import { loadSongFeel, saveSongFeel } from './discovery-storage';
import { toSongFeel } from './sound';
import { soundFor } from './sound-index';
import { soundLookup } from './sound-lookup-app';
import { isFullyMeasured } from './taste-decoded';
import type { SongFeel } from './tasteform';

// Each song's feel (energy, tempo and the rest) for the Tasteform, Taste
// Decoded and the Blind Spot Test: ReccoBeats' catalog values, from the
// bundled index or a live Deezer → ReccoBeats lookup (lib/sound-lookup.ts).
// No audio is sent anywhere.
const PER_SESSION = 80;

let cache: Record<number, SongFeel> | null = null;
let looked = 0;

export type Measurable = Pick<DiscoveryTrack, 'id'> & { trackName?: string; artistName?: string };

export async function loadFeels(): Promise<Record<number, SongFeel>> {
  cache ??= await loadSongFeel();
  return cache;
}

export function peekFeels(): Record<number, SongFeel> {
  return cache ? { ...cache } : {};
}

export async function measureMissing(
  tracks: Measurable[],
  onUpdate?: (feels: Record<number, SongFeel>) => void,
  cancelled: () => boolean = () => false
): Promise<Record<number, SongFeel>> {
  const feels = await loadFeels();
  if (cancelled()) return feels;
  let changed = 0;
  for (const t of tracks) {
    if (isFullyMeasured(feels[t.id])) continue;
    const indexed = soundFor(t.id);
    if (indexed) {
      feels[t.id] = toSongFeel(indexed);
      changed += 1;
    }
  }
  onUpdate?.({ ...feels });
  for (const t of tracks) {
    if (cancelled() || soundLookup.paused() || looked >= PER_SESSION) break;
    if (isFullyMeasured(feels[t.id]) || !t.trackName || !t.artistName) continue;
    looked += 1;
    const rec = await soundLookup.lookup(t);
    if (rec?.status === 'measured') {
      feels[t.id] = toSongFeel(rec.features);
      changed += 1;
      if (!cancelled()) onUpdate?.({ ...feels });
    }
  }
  if (changed) await saveSongFeel(feels);
  return feels;
}
