import { unzlibSync } from 'fflate';
import { useEffect, useState } from 'react';

import { coverColor, decodeTinyPng, tinyArtworkUrl, type CoverColor } from '@/lib/cover-color';
import { loadCoverColors, saveCoverColors } from '@/lib/discovery-storage';

// Shared across mounts: a color is read once per install, then comes from storage.
let cache: Record<string, CoverColor> | null = null;
const failed = new Set<string>();

async function readColor(artwork: string): Promise<CoverColor | null> {
  try {
    const res = await fetch(tinyArtworkUrl(artwork));
    if (!res.ok) return null;
    const pixels = decodeTinyPng(new Uint8Array(await res.arrayBuffer()), unzlibSync);
    return pixels ? coverColor(pixels) : null;
  } catch {
    return null;
  }
}

/** Each cover's color, keyed by artworkUrl100. Missing ones are fetched a few at a time and fill in as they arrive. */
export function useCoverColors(artworks: string[]): Record<string, CoverColor> {
  const [colors, setColors] = useState<Record<string, CoverColor>>(cache ?? {});
  const key = artworks.join('|');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      cache ??= await loadCoverColors();
      if (cancelled) return;
      setColors({ ...cache });
      const missing = [...new Set(artworks)].filter((a) => a && !cache![a] && !failed.has(a));
      for (let i = 0; i < missing.length && !cancelled; i += 4) {
        const batch = missing.slice(i, i + 4);
        const found = await Promise.all(batch.map(readColor));
        batch.forEach((a, j) => (found[j] ? (cache![a] = found[j]!) : failed.add(a)));
        if (!cancelled) setColors({ ...cache! });
      }
      if (missing.length) saveCoverColors(cache!);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is artworks, compared by value
  }, [key]);

  return colors;
}
