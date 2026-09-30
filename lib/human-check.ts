// Human-only: keep AI-generated "artists" out of the feed, and show proof
// when an artist is clearly a real person. Pure helpers; the network side
// lives in lib/human-check-api.ts.
//
// Listeners on Last.fm and editors on MusicBrainz already tag AI acts
// ("ai", "ai slop", "clanker"…). Real small artists don't carry those tags.
// A missing tag is never treated as proof of AI.

const AI_TAGS = new Set([
  'ai',
  'ai generated',
  'aigenerated',
  'ai generated music',
  'ai music',
  'ai slop',
  'ai artist',
  'ai band',
  'ai persona',
  'ai song',
  'artificial intelligence',
  'generative ai',
  'clanker',
  'suno',
  'suno ai',
  'udio',
]);

const cleanTag = (t: string) => t.toLowerCase().replace(/[-_]/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** True when listeners have tagged this artist as AI-made. `artistName` stops a singer named "AI" flagging herself. */
export function isAiTagged(tags: string[], artistName?: string): boolean {
  const own = artistName ? cleanTag(artistName) : null;
  return tags.some((t) => {
    const c = cleanTag(t);
    return AI_TAGS.has(c) && c !== own;
  });
}

/**
 * The same check with vote weights, so one stray vote can't brand a famous
 * artist: the strongest AI tag needs `minCount` votes (MusicBrainz: 2; Last.fm
 * weights run 0–100: 10) and a quarter of the weight of the artist's top tag.
 */
export function isAiWeighted(tags: { name: string; count: number }[], artistName: string, minCount: number): boolean {
  const top = Math.max(0, ...tags.map((t) => t.count));
  const ai = Math.max(0, ...tags.filter((t) => isAiTagged([t.name], artistName)).map((t) => t.count));
  return ai >= minCount && ai >= top * 0.25;
}

export function normalizeArtist(name: string): string {
  return name.toLowerCase().trim().replace(/^the\s+/, '').replace(/\s+/g, ' ');
}

/** True when the artist is on any of the given block lists (built-in scan, crowd reports, live checks). */
export function isBlocked(name: string, ...lists: Set<string>[]): boolean {
  const n = normalizeArtist(name);
  return lists.some((l) => l.has(n));
}

export type Proof = { shows: number; physical: number };

/** "Real person · 12 shows on record · on vinyl or CD", or null when nothing was found. */
export function proofLine(proof: Proof | null): string | null {
  if (!proof || (proof.shows <= 0 && proof.physical <= 0)) return null;
  const parts = ['Real person'];
  if (proof.shows > 0) parts.push(`${proof.shows} ${proof.shows === 1 ? 'show' : 'shows'} on record`);
  if (proof.physical > 0) parts.push('on vinyl or CD');
  return parts.join(' · ');
}
