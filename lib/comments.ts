// Pure helpers for song comments and one-word "vibes".

export type Vibe = { word: string; count: number };
export type Comment = { id: number; name: string; body: string; created_at: string };

const MAX_COMMENT = 280;
const MAX_VIBE = 24;

export function cleanComment(text: string): string | null {
  const t = text.trim();
  return t.length === 0 || t.length > MAX_COMMENT ? null : t;
}

export function cleanVibe(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return t.length === 0 || t.length > MAX_VIBE ? null : t;
}

/**
 * Listener votes first (most agreed first), then the artist's Last.fm tags
 * nobody has voted on yet, so the section is never empty.
 */
export function mergeVibes(lastfmTags: string[], votes: Vibe[]): Vibe[] {
  const out = [...votes].sort((a, b) => b.count - a.count);
  const seen = new Set(out.map((v) => v.word.toLowerCase()));
  for (const tag of lastfmTags) {
    if (seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push({ word: tag.toLowerCase(), count: 0 });
  }
  return out;
}

export function timeAgo(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}
