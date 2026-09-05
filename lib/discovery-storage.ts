import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DiscoveryTrack, SwipeEntry } from './discovery';

// All persistence is best-effort: a read/write failure falls back to an empty
// result rather than throwing, mirroring lib/taste-test.ts's pattern.

const STORAGE_PREFIX = 'blindspotDiscovery';
const SWIPE_HISTORY_KEY = `${STORAGE_PREFIX}:swipeHistory`;
const DISCOVERED_GENRES_KEY = `${STORAGE_PREFIX}:discoveredGenres`;
const LIKED_TRACKS_KEY = `${STORAGE_PREFIX}:likedTracks`;
const EXPORT_BATCHES_KEY = `${STORAGE_PREFIX}:exportBatches`;

export async function loadSwipeHistory(): Promise<SwipeEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(SWIPE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Appends one swipe to the all-time history. Never overwrites existing entries. */
export async function appendSwipeEntry(entry: SwipeEntry): Promise<void> {
  try {
    const existing = await loadSwipeHistory();
    existing.push(entry);
    await AsyncStorage.setItem(SWIPE_HISTORY_KEY, JSON.stringify(existing));
  } catch {
    // ignore
  }
}

/**
 * Overwrites the persisted history with `history` wholesale, rather than the
 * load-then-modify-then-save pattern appendSwipeEntry uses. Used by undo,
 * which already has the correct (trimmed) array in memory — reloading from
 * disk first would race against the original swipe's own in-flight
 * appendSwipeEntry write.
 */
export async function saveSwipeHistory(history: SwipeEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SWIPE_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // ignore
  }
}

export async function loadDiscoveredGenres(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DISCOVERED_GENRES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveDiscoveredGenres(genres: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(DISCOVERED_GENRES_KEY, JSON.stringify(genres));
  } catch {
    // ignore
  }
}

// swipeHistory only carries {trackId, artistId, genre, action, timestamp} — not
// enough to render a liked-tracks list. Full DiscoveryTrack records for likes
// are kept here instead, independent of swipeHistory, in chronological
// (append) order; callers reverse for newest-first display.

export async function loadLikedTracks(): Promise<DiscoveryTrack[]> {
  try {
    const raw = await AsyncStorage.getItem(LIKED_TRACKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendLikedTrack(track: DiscoveryTrack): Promise<void> {
  try {
    const existing = await loadLikedTracks();
    existing.push(track);
    await AsyncStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify(existing));
  } catch {
    // ignore
  }
}

/**
 * Overwrites the persisted liked tracks with `tracks` wholesale, mirroring
 * saveSwipeHistory's pattern. Used when removing a track — the screen already
 * holds the full (now-filtered) list in state, so there's no need to reload
 * from disk first.
 */
export async function saveLikedTracks(tracks: DiscoveryTrack[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify(tracks));
  } catch {
    // ignore
  }
}

// A bulk export archives the exported tracks here, browsable later, and
// removes them from likedTracks — this is what makes "export" different from
// "delete": the tracks aren't gone, just moved out of the active list.

export type ExportBatch = {
  id: string;
  exportedAt: number;
  tracks: DiscoveryTrack[];
};

export async function loadExportBatches(): Promise<ExportBatch[]> {
  try {
    const raw = await AsyncStorage.getItem(EXPORT_BATCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendExportBatch(batch: ExportBatch): Promise<void> {
  try {
    const existing = await loadExportBatches();
    existing.push(batch);
    await AsyncStorage.setItem(EXPORT_BATCHES_KEY, JSON.stringify(existing));
  } catch {
    // ignore
  }
}
