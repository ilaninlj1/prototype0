// The sound clues and taste tier share one sentence-case line under the card.

export function cluesLine(label: string | null, tier: string | null): string | null {
  const sound = label?.replace(/\b(MAJOR|MINOR)\b/g, (word) => word.toLowerCase());
  return [sound, tier].filter(Boolean).join(' · ') || null;
}
