import { useEffect, useState } from 'react';

import type { DiscoveryTrack } from '@/lib/discovery';
import { loadSongFeel, saveSongFeel } from '@/lib/discovery-storage';
import type { SongFeel } from '@/lib/tasteform';

// ReccoBeats (free, no key) measures Spotify-style audio features from a
// clip. We send the 30s iTunes preview itself: React Native's upload reads a
// part's `uri` straight from the web, so nothing is saved on the phone first.
// Tested 2026-09-30 on 14 obscure catalog songs: 14/14 measured, 1–2s each.
// Last.fm mood tags covered 0/14 and Deezer tempo about 1 in 4, so neither
// can carry the breathing for the small artists Blindspot finds.
const ANALYZE_URL = 'https://api.reccobeats.com/v1/analysis/audio-features';
/** Be gentle: its rate limits aren't published. */
const AT_ONCE = 2;
const PER_SESSION = 80;

let cache: Record<number, SongFeel> | null = null;
const failed = new Set<number>();
let sent = 0;
let limited = false;

async function measure(track: DiscoveryTrack): Promise<SongFeel | null> {
  try {
    const body = new FormData();
    body.append('audioFile', { uri: track.previewUrl, name: 'preview.m4a', type: 'audio/mp4' } as unknown as Blob);
    sent += 1;
    const res = await fetch(ANALYZE_URL, { method: 'POST', body });
    if (res.status === 429) limited = true;
    if (!res.ok) return null;
    const f = await res.json();
    if (typeof f.energy !== 'number') return null;
    return { energy: f.energy, valence: f.valence, tempo: f.tempo };
  } catch {
    return null;
  }
}

/** Energy and mood per saved song, keyed by track id. Unmeasured ones are measured a couple at a time and fill in as they arrive. */
export function useSongFeel(tracks: DiscoveryTrack[]): Record<number, SongFeel> {
  const [feels, setFeels] = useState<Record<number, SongFeel>>(cache ?? {});
  const key = tracks.map((t) => t.id).join('|');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      cache ??= await loadSongFeel();
      if (cancelled) return;
      setFeels({ ...cache });
      const missing = tracks.filter((t) => t.previewUrl && !cache![t.id] && !failed.has(t.id));
      let measured = 0;
      for (let i = 0; i < missing.length && !cancelled && !limited && sent < PER_SESSION; i += AT_ONCE) {
        const batch = missing.slice(i, i + AT_ONCE);
        const found = await Promise.all(batch.map(measure));
        batch.forEach((t, j) => {
          if (found[j]) {
            cache![t.id] = found[j]!;
            measured += 1;
          } else failed.add(t.id);
        });
        if (!cancelled) setFeels({ ...cache! });
      }
      if (measured) saveSongFeel(cache!);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the track ids, compared by value
  }, [key]);

  return feels;
}
