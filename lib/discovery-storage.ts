import AsyncStorage from '@react-native-async-storage/async-storage';

import type { BlindTestSong } from './blind-test';
import { callAction, toggleCall, type CalledShot } from './called-shots';
import type { CoverColor } from './cover-color';
import type { Drop, DropVote } from './daily-drop';
import type { DiscoveryTrack, Region, SwipeEntry } from './discovery';
import type { PresetId } from './pool-types';
import { deleteSongs, restoreSongs, saveSong, setNote, type DeletedSong, type Saved } from './saved-songs';
import type { DecodedVotes } from './taste-decoded';
import type { SongFeel } from './tasteform';

// All persistence is best-effort: a read/write failure falls back to an empty
// result rather than throwing, mirroring lib/taste-test.ts's pattern.

const STORAGE_PREFIX = 'blindspotDiscovery';
const SWIPE_HISTORY_KEY = `${STORAGE_PREFIX}:swipeHistory`;
const DISCOVERED_GENRES_KEY = `${STORAGE_PREFIX}:discoveredGenres`;
const LIKED_TRACKS_KEY = `${STORAGE_PREFIX}:likedTracks`;
const CALLS_KEY = `${STORAGE_PREFIX}:calls`;
const RECENTLY_DELETED_KEY = `${STORAGE_PREFIX}:recentlyDeleted`;
const EXPORT_BATCHES_KEY = `${STORAGE_PREFIX}:exportBatches`;
const REGION_KEY = `${STORAGE_PREFIX}:region`;
const PRESET_CHANGES_KEY = `${STORAGE_PREFIX}:presetChanges`;

/** Falls back to the default storefront on a missing, corrupt, or unrecognized value — not just a read failure. */
export async function loadRegion(): Promise<Region> {
  try {
    const raw = await AsyncStorage.getItem(REGION_KEY);
    return raw === 'MX' || raw === 'ZA' ? raw : 'US';
  } catch {
    return 'US';
  }
}

export async function saveRegion(region: Region): Promise<void> {
  try {
    await AsyncStorage.setItem(REGION_KEY, region);
  } catch {
    // ignore
  }
}

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

/** Recently deleted: songs removed from Liked, newest deletion first, until restored or cleared. */
export async function loadRecentlyDeleted(): Promise<DeletedSong[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_DELETED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Likes are read-modify-write; run them one at a time so two quick taps
// can't each read the old list and drop the other's change. Liked and
// Recently deleted change together (delete, restore), so they share it.
let likedQueue: Promise<void> = Promise.resolve();
function updateSaved(change: (saved: Saved) => Saved): Promise<void> {
  likedQueue = likedQueue.then(async () => {
    try {
      const [liked, bin] = await Promise.all([loadLikedTracks(), loadRecentlyDeleted()]);
      const next = change({ liked, bin });
      const writes: [string, string][] = [];
      if (next.liked !== liked) writes.push([LIKED_TRACKS_KEY, JSON.stringify(next.liked)]);
      if (next.bin !== bin) writes.push([RECENTLY_DELETED_KEY, JSON.stringify(next.bin)]);
      if (writes.length > 0) await AsyncStorage.multiSet(writes);
    } catch {
      // ignore
    }
  });
  return likedQueue;
}

export function updateLikedTracks(change: (tracks: DiscoveryTrack[]) => DiscoveryTrack[]): Promise<void> {
  return updateSaved((s) => {
    const liked = change(s.liked);
    return liked === s.liked ? s : { ...s, liked };
  });
}

export function appendLikedTrack(track: DiscoveryTrack): Promise<void> {
  return updateSaved((s) => saveSong(s, track));
}

export async function loadCalls(): Promise<CalledShot[]> {
  try {
    const raw = await AsyncStorage.getItem(CALLS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const callListeners = new Set<(calls: CalledShot[]) => void>();
export function onCallsChange(fn: (calls: CalledShot[]) => void): () => void {
  callListeners.add(fn);
  return () => { callListeners.delete(fn); };
}

let callsQueue: Promise<void> = Promise.resolve();

/** Recheck the limit inside the queue; only accepted new calls save a song. */
export function toggleStoredCall(call: CalledShot, saveTrack: () => Promise<void>): Promise<void> {
  callsQueue = callsQueue.then(async () => {
    try {
      const calls = await loadCalls();
      const next = toggleCall(calls, call);
      if (next === calls) return;
      if (callAction(calls, call.trackId, call.calledAt) === 'call') await saveTrack();
      await AsyncStorage.setItem(CALLS_KEY, JSON.stringify(next));
      callListeners.forEach((fn) => fn(next));
    } catch {
      // ignore
    }
  });
  return callsQueue;
}

/** Remove songs from Liked into Recently deleted. */
export function deleteLikedTracks(ids: Iterable<number>): Promise<void> {
  const list = [...ids];
  return updateSaved((s) => deleteSongs(s, list, Date.now()));
}

/** Put songs from Recently deleted back into Liked, in their old spots. */
export function restoreDeletedTracks(ids: Iterable<number>): Promise<void> {
  const list = [...ids];
  return updateSaved((s) => restoreSongs(s, list));
}

/** Delete songs from Recently deleted for good. */
export function clearRecentlyDeleted(ids: Iterable<number>): Promise<void> {
  const gone = new Set(ids);
  return updateSaved((s) => ({ ...s, bin: s.bin.filter((d) => !gone.has(d.track.id)) }));
}

/** Add, change or clear (empty text) the listener's note on a saved song. */
export function setLikedNote(id: number, text: string): Promise<void> {
  return updateLikedTracks((liked) => setNote(liked, id, text));
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

// Phase 3 logging (2026-09-16): the stated purpose is deciding whether
// people actually move between presets — nothing else recorded that.
// Separate from swipeHistory (a preset change isn't a swipe) rather than
// folded into it as another SwipeAction, since it has no trackId/artistId
// of its own.
export type PresetChangeEntry = {
  from: PresetId;
  to: PresetId;
  timestamp: number;
  // How many cards were skip/like/genre-jump-ed since the previous preset
  // change (or session start) — set by the caller right before it resets
  // its own counter, not derived here.
  cardsSeenBeforeSwitch: number;
};

export async function loadPresetChangeHistory(): Promise<PresetChangeEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(PRESET_CHANGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendPresetChangeEntry(entry: PresetChangeEntry): Promise<void> {
  try {
    const existing = await loadPresetChangeHistory();
    existing.push(entry);
    await AsyncStorage.setItem(PRESET_CHANGES_KEY, JSON.stringify(existing));
  } catch {
    // ignore
  }
}

// Current Last.fm listener counts for liked artists, keyed by artist name —
// what the Liked list and Profile compare each find's found-at count against.
const LISTENERS_NOW_KEY = `${STORAGE_PREFIX}:listenersNow`;

export type ListenersNow = Record<string, { listeners: number; fetchedAt: number }>;

export async function loadListenersNow(): Promise<ListenersNow> {
  try {
    const raw = await AsyncStorage.getItem(LISTENERS_NOW_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveListenersNow(cache: ListenersNow): Promise<void> {
  try {
    await AsyncStorage.setItem(LISTENERS_NOW_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

// ---------- Daily Drop ----------

const DEVICE_ID_KEY = `${STORAGE_PREFIX}:deviceId`;
const CACHED_DROP_KEY = `${STORAGE_PREFIX}:cachedDrop`;
const DROP_PROGRESS_KEY = `${STORAGE_PREFIX}:dropProgress`;
const PENDING_VOTES_KEY = `${STORAGE_PREFIX}:pendingVotes`;

export type DropProgress = { day: string; votes: DropVote[]; guess?: number };

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/** A random v4 UUID, made once per install — one vote per phone per song. */
export async function loadDeviceId(): Promise<string> {
  const existing = await readJson<string | null>(DEVICE_ID_KEY, null);
  if (existing) return existing;
  const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
  await writeJson(DEVICE_ID_KEY, id);
  return id;
}

export const loadCachedDrop = () => readJson<Drop | null>(CACHED_DROP_KEY, null);
export const saveCachedDrop = (d: Drop) => writeJson(CACHED_DROP_KEY, d);
export const loadDropProgress = () => readJson<DropProgress | null>(DROP_PROGRESS_KEY, null);
export const saveDropProgress = (p: DropProgress) => writeJson(DROP_PROGRESS_KEY, p);
export const loadPendingVotes = () => readJson<DropProgress[]>(PENDING_VOTES_KEY, []);
export const savePendingVotes = (p: DropProgress[]) => writeJson(PENDING_VOTES_KEY, p);

const BEST_STREAKS_KEY = `${STORAGE_PREFIX}:bestStreaks`;
export type BestStreaks = { spot: number; h2h: number };
export const loadBestStreaks = () => readJson<BestStreaks>(BEST_STREAKS_KEY, { spot: 0, h2h: 0 });
/** Saves `streak` if it beats the stored best; returns the best after saving. */
export async function saveBestStreak(mode: keyof BestStreaks, streak: number): Promise<number> {
  const best = await loadBestStreaks();
  if (streak > best[mode]) await writeJson(BEST_STREAKS_KEY, { ...best, [mode]: streak });
  return Math.max(best[mode], streak);
}

// Days whose Daily Drop was finished (all 5 swipes) — the streak is derived from this.
const FINISHED_DAYS_KEY = `${STORAGE_PREFIX}:finishedDropDays`;
export const loadFinishedDays = () => readJson<string[]>(FINISHED_DAYS_KEY, []);
export async function addFinishedDay(day: string): Promise<string[]> {
  const days = await loadFinishedDays();
  if (days.includes(day)) return days;
  const next = [...days, day];
  await writeJson(FINISHED_DAYS_KEY, next);
  return next;
}

// Last Blind Spot Test result, shown on the Play card.
const BLIND_TEST_KEY = `${STORAGE_PREFIX}:blindTest`;
/** `songs` since 2026-10-02 (Taste Decoded); older results don't have them. */
export type BlindTestResult = { never: string[]; neverLiked: number; otherLiked: number; at: number; songs?: BlindTestSong[] };
export const loadBlindTest = () => readJson<BlindTestResult | null>(BLIND_TEST_KEY, null);
export const saveBlindTest = (r: BlindTestResult) => writeJson(BLIND_TEST_KEY, r);

// Name shown to friends on Blind Pack links.
const SENDER_NAME_KEY = `${STORAGE_PREFIX}:senderName`;
export const loadSenderName = () => readJson<string>(SENDER_NAME_KEY, '');
export const saveSenderName = (name: string) => writeJson(SENDER_NAME_KEY, name);

// Tune → Genres: shuffle between genres as the feed refills, or stay on one.
const SHUFFLE_GENRES_KEY = `${STORAGE_PREFIX}:shuffleGenres`;
export const loadShuffleGenres = () => readJson<boolean>(SHUFFLE_GENRES_KEY, false);
export const saveShuffleGenres = (on: boolean) => writeJson(SHUFFLE_GENRES_KEY, on);

// ---------- Tasteform ----------

const COVER_COLORS_KEY = `${STORAGE_PREFIX}:coverColors`;

/** Colors read from each cover, keyed by its artworkUrl100 — they never change, so fetch once. */
export const loadCoverColors = () => readJson<Record<string, CoverColor>>(COVER_COLORS_KEY, {});
export const saveCoverColors = (colors: Record<string, CoverColor>) => writeJson(COVER_COLORS_KEY, colors);

const SONG_FEEL_KEY = `${STORAGE_PREFIX}:songFeel`;

/** Energy/mood measured from each song's audio, keyed by track id — measured once, kept for good. */
export const loadSongFeel = () => readJson<Record<number, SongFeel>>(SONG_FEEL_KEY, {});
export const saveSongFeel = (feels: Record<number, SongFeel>) => writeJson(SONG_FEEL_KEY, feels);

// ---------- Taste Decoded ----------

const DECODED_SEEN_KEY = `${STORAGE_PREFIX}:decodedSeen`;
/** Finding ids already shown on the Decoded page; any other finding is new. */
export const loadDecodedSeen = () => readJson<string[]>(DECODED_SEEN_KEY, []);
export const saveDecodedSeen = (ids: string[]) => writeJson(DECODED_SEEN_KEY, ids);

const DECODED_VOTES_KEY = `${STORAGE_PREFIX}:decodedVotes`;
export const loadDecodedVotes = () => readJson<DecodedVotes>(DECODED_VOTES_KEY, {});
export const saveDecodedVotes = (votes: DecodedVotes) => writeJson(DECODED_VOTES_KEY, votes);

// ---------- Finds News ----------

export type NewsSeenEntry = { listeners: number; seenAt: number };
export type NewsSeenState = Record<string, NewsSeenEntry>;

const NEWS_SEEN_KEY = `${STORAGE_PREFIX}:newsSeen`;
export const loadNewsSeen = () => readJson<NewsSeenState>(NEWS_SEEN_KEY, {});
export const saveNewsSeen = (seen: NewsSeenState) => writeJson(NEWS_SEEN_KEY, seen);

export type ArtistRelease = {
  collectionId: number;
  collectionName: string;
  releaseDate: string;
  artworkUrl100?: string;
};
export type ReleaseCheck = {
  checkedAt: number;
  releases: ArtistRelease[];
};
export type ReleaseChecks = Record<number, ReleaseCheck>;

const RELEASE_CHECKS_KEY = `${STORAGE_PREFIX}:releaseChecks`;
export const loadReleaseChecks = () => readJson<ReleaseChecks>(RELEASE_CHECKS_KEY, {});
export const saveReleaseChecks = (checks: ReleaseChecks) => writeJson(RELEASE_CHECKS_KEY, checks);

