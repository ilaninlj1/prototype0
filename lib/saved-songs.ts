// Saved songs and Recently deleted, as one piece of data that survives
// relaunching the app. A song is saved (double-tap), can carry the
// listener's own note, is moved to Recently deleted instead of vanishing,
// and can be restored to its old spot from there.
// Pure — lib/discovery-storage.ts reads and writes it.

import type { DiscoveryTrack } from './discovery';

export type DeletedSong = {
  track: DiscoveryTrack;
  deletedAt: number;
  // Where it sat in the saved list when it was deleted, for putting it back.
  index: number;
};

export type Saved = { liked: DiscoveryTrack[]; bin: DeletedSong[] };

export const NOTE_MAX = 140;
export const BIN_MAX = 200;

export function cleanNote(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
}

/** Save a song once, at the end. Saving one from Recently deleted takes it out of there and keeps its note. */
export function saveSong(s: Saved, track: DiscoveryTrack): Saved {
  if (s.liked.some((t) => t.id === track.id)) return s;
  const old = s.bin.find((d) => d.track.id === track.id);
  const saved = old?.track.note && !track.note ? { ...track, note: old.track.note } : track;
  return { liked: [...s.liked, saved], bin: old ? s.bin.filter((d) => d !== old) : s.bin };
}

/** Move songs to Recently deleted, newest deletion first. */
export function deleteSongs(s: Saved, ids: Iterable<number>, now: number): Saved {
  const gone = new Set(ids);
  const moved: DeletedSong[] = [];
  s.liked.forEach((track, index) => {
    if (gone.has(track.id)) moved.push({ track, deletedAt: now, index });
  });
  if (moved.length === 0) return s;
  return {
    liked: s.liked.filter((t) => !gone.has(t.id)),
    bin: [...moved, ...s.bin.filter((d) => !gone.has(d.track.id))].slice(0, BIN_MAX),
  };
}

/**
 * Put songs back in their old spots. Songs with a save date go back by date;
 * older ones without one go back to their old position. Walking the bin
 * newest-deletion first undoes the deletions in reverse, so restoring
 * everything gives back the exact old order.
 */
export function restoreSongs(s: Saved, ids: Iterable<number>): Saved {
  const wanted = new Set(ids);
  const back = s.bin.filter((d) => wanted.has(d.track.id));
  if (back.length === 0) return s;
  const liked = [...s.liked];
  for (const { track, index } of back) {
    if (liked.some((t) => t.id === track.id)) continue;
    let at = Math.min(index, liked.length);
    if (track.likedAt != null) {
      const later = liked.findIndex((t) => t.likedAt != null && t.likedAt > track.likedAt!);
      at = later === -1 ? liked.length : later;
    }
    liked.splice(at, 0, track);
  }
  return { liked, bin: s.bin.filter((d) => !wanted.has(d.track.id)) };
}

/** Add, change or (with an empty note) clear the listener's note on one saved song. */
export function setNote(liked: DiscoveryTrack[], id: number, text: string): DiscoveryTrack[] {
  const note = cleanNote(text);
  const i = liked.findIndex((t) => t.id === id);
  if (i === -1 || (liked[i].note ?? '') === note) return liked;
  const { note: _old, ...rest } = liked[i];
  const next = [...liked];
  next[i] = note ? { ...rest, note } : rest;
  return next;
}
