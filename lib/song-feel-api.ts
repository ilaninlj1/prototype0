import type { DiscoveryTrack } from './discovery';
import { loadSongFeel, saveSongFeel } from './discovery-storage';
import { isFullyMeasured, parseSongFeel } from './taste-decoded';
import type { SongFeel } from './tasteform';

// ReccoBeats (free, no key) measures Spotify-style audio features from a
// clip. We send the 30s iTunes preview itself: React Native's upload reads a
// part's `uri` straight from the web, so nothing is saved on the phone first.
// Tested 2026-09-30 on 14 obscure catalog songs: 14/14 measured, 1–2s each.
// Last.fm mood tags covered 0/14 and Deezer tempo about 1 in 4, so neither
// can carry the breathing for the small artists Blindspot finds.
// One cache and one budget for the Tasteform, Taste Decoded and the Blind Spot Test.
const ANALYZE_URL = 'https://api.reccobeats.com/v1/analysis/audio-features';
/** Be gentle: its rate limits aren't published. */
const AT_ONCE = 2;
const PER_SESSION = 80;

let cache: Record<number, SongFeel> | null = null;
const failed = new Set<number>();
const inFlight = new Set<number>();
let sent = 0;
let limited = false;

export type Measurable = Pick<DiscoveryTrack, 'id' | 'previewUrl'>;

async function measure(track: Measurable): Promise<SongFeel | null> {
  try {
    const body = new FormData();
    body.append('audioFile', { uri: track.previewUrl, name: 'preview.m4a', type: 'audio/mp4' } as unknown as Blob);
    sent += 1;
    const res = await fetch(ANALYZE_URL, { method: 'POST', body });
    if (res.status === 429) limited = true;
    if (!res.ok) return null;
    return parseSongFeel(await res.json());
  } catch {
    return null;
  }
}

/** Everything measured so far, loaded from storage the first time. */
export async function loadFeels(): Promise<Record<number, SongFeel>> {
  cache ??= await loadSongFeel();
  return cache;
}

/** What's in memory right now, without waiting on storage. */
export function peekFeels(): Record<number, SongFeel> {
  return cache ? { ...cache } : {};
}

/**
 * Measures the songs that aren't fully measured yet, a couple at a time, within this session's budget.
 * `onUpdate` gets a copy of the whole cache once loaded and after each batch. Songs another caller is
 * already measuring are skipped, so the Tasteform and Taste Decoded can both ask for the same saves.
 */
export async function measureMissing(
  tracks: Measurable[],
  onUpdate?: (feels: Record<number, SongFeel>) => void,
  cancelled: () => boolean = () => false
): Promise<Record<number, SongFeel>> {
  const feels = await loadFeels();
  if (cancelled()) return feels;
  onUpdate?.({ ...feels });
  const missing = tracks.filter((t) => t.previewUrl && !isFullyMeasured(feels[t.id]) && !failed.has(t.id) && !inFlight.has(t.id));
  let measured = 0;
  for (let i = 0; i < missing.length && !cancelled() && !limited && sent < PER_SESSION; i += AT_ONCE) {
    const batch = missing.slice(i, i + AT_ONCE);
    batch.forEach((t) => inFlight.add(t.id));
    const found = await Promise.all(batch.map(measure));
    batch.forEach((t, j) => {
      inFlight.delete(t.id);
      if (found[j]) {
        feels[t.id] = found[j]!;
        measured += 1;
      } else failed.add(t.id); // an older entry, if any, stays: its energy still drives the breathing
    });
    if (!cancelled()) onUpdate?.({ ...feels });
  }
  if (measured) await saveSongFeel(feels);
  return feels;
}
