import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SwipeEntry } from './discovery';

// All persistence is best-effort: a read/write failure falls back to an empty
// result rather than throwing, mirroring lib/taste-test.ts's pattern.

const STORAGE_PREFIX = 'blindspotDiscovery';
const SWIPE_HISTORY_KEY = `${STORAGE_PREFIX}:swipeHistory`;
const DISCOVERED_GENRES_KEY = `${STORAGE_PREFIX}:discoveredGenres`;

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
