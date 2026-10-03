/**
 * The truly blind feed: artists already in your Spotify library never come up blind on
 * Home, so every card is someone new to you. Built only from songs you imported from a
 * file; Spotify's Developer Policy forbids building functionality from data read through
 * its API, so the login's songs are display-only.
 */
import { normalizeArtist } from './human-check.ts';
import type { SpotifyLike } from './spotify.ts';

/** Every credited artist in a name: "A & B", "A feat. B", "A ft. B", "A, B", "A x B". */
export function artistsIn(name: string): string[] {
  return name
    .split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b|\bwith\b)\s*/i)
    .map((a) => normalizeArtist(a))
    .filter(Boolean);
}

export function knownArtists(songs: SpotifyLike[]): Set<string> {
  return new Set(songs.filter((s) => s.source === 'file').flatMap((s) => artistsIn(s.artist)));
}

export function isKnown(name: string, known: Set<string>): boolean {
  return known.size > 0 && artistsIn(name).some((a) => known.has(a));
}

// One set for the whole app: Rewind's import updates it, Home's feed reads it.
let current = new Set<string>();
export const setKnownArtists = (songs: SpotifyLike[]) => (current = knownArtists(songs));
export const alreadyKnown = (name: string) => isKnown(name, current);
export const knownCount = () => current.size;
