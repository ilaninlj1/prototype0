// The sound clues and taste tier share one sentence-case line under the card.

export function cluesLine(label: string | null, tier: string | null): string | null {
  // Prints saved before 2026-11-15 carry ♯ and ♭, which no font here can draw.
  const sound = label?.replace(/\b(MAJOR|MINOR)\b/g, (word) => word.toLowerCase()).replace(/♯/g, '#').replace(/♭/g, 'b');
  return [sound, tier].filter(Boolean).join(' · ') || null;
}

/** Where the words about an artist's listeners change (describeListeners in lib/discovery.ts uses the same three). */
export const LISTENER_CUTS = [25_000, 100_000, 1_000_000] as const;

/**
 * Where an artist sits between a hidden gem and a household name, 0 to 1, from 1K listeners to 10M (Details' meter).
 * Each quarter of the meter is one of the four verdicts, so the dot and the words can't disagree.
 */
export function listenerMeter(listeners: number): number {
  if (!(listeners > 0)) return 0;
  const stops = [1_000, ...LISTENER_CUTS, 10_000_000];
  if (listeners <= stops[0]) return 0;
  for (let i = 1; i < stops.length; i++) {
    if (listeners < stops[i]) return (i - 1 + Math.log(listeners / stops[i - 1]) / Math.log(stops[i] / stops[i - 1])) / 4;
  }
  return 1;
}

/** Tune's one-line summary of where the feed is set: "Hidden gems · slow, calm". */
export function tuneSummary(preset: string, sound: string | null): string {
  return sound ? `${preset} · ${sound}` : preset;
}
