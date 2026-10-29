// The sound clues and taste tier share one sentence-case line under the card.

export function cluesLine(label: string | null, tier: string | null): string | null {
  const sound = label?.replace(/\b(MAJOR|MINOR)\b/g, (word) => word.toLowerCase());
  return [sound, tier].filter(Boolean).join(' · ') || null;
}

/**
 * Where an artist sits between a hidden gem and a household name, 0 to 1, on
 * a log scale from 1K listeners to 10M (Details' meter).
 */
export function listenerMeter(listeners: number): number {
  if (!(listeners > 0)) return 0;
  return Math.min(1, Math.max(0, (Math.log10(listeners) - 3) / 4));
}

/** Tune's one-line summary of where the feed is set: "Hidden gems · slow, calm". */
export function tuneSummary(preset: string, sound: string | null): string {
  return sound ? `${preset} · ${sound}` : preset;
}
