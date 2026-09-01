import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------- Types ----------

export type Pool = 'liked' | 'disliked';
export type Rating = 1 | 2 | 3 | 4 | 5;

export type PoolTrack = {
  id: number;
  trackName: string;
  artistName: string;
  artworkUrl100: string;
  primaryGenreName: string;
  previewUrl: string;
  pool: Pool;
  sourceGenre: string;
};

export type RatedTrack = PoolTrack & { rating: Rating };

/** A rated track as stored in the all-time history — one entry per rating, ever. */
export type HistoryEntry = RatedTrack & { timestamp: number };

export type GenrePicks = {
  liked: string[];
  disliked: string[];
};

// ---------- Constants ----------

export const GENRES = [
  'Pop',
  'Rock',
  'Hip-Hop',
  'Country',
  'Jazz',
  'Classical',
  'Electronic',
  'R&B',
  'Reggae',
  'Metal',
];

export const PICKS_PER_SIDE = 3;
export const TRACKS_PER_SESSION = 10;

const STORAGE_PREFIX = 'blindTasteTest';
const GENRE_PICKS_KEY = `${STORAGE_PREFIX}:genrePicks`;
const HISTORY_KEY = `${STORAGE_PREFIX}:history`;

// ---------- Track helpers ----------

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dedupeById(tracks: PoolTrack[]): PoolTrack[] {
  const map = new Map<number, PoolTrack>();
  for (const t of tracks) {
    if (!map.has(t.id)) map.set(t.id, t);
  }
  return Array.from(map.values());
}

export async function fetchGenreTracks(genre: string, pool: Pool): Promise<PoolTrack[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(genre)}&entity=song&limit=25`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`iTunes search failed for ${genre}`);
  const json = await res.json();
  const results: any[] = Array.isArray(json?.results) ? json.results : [];

  return results
    .filter((r) => typeof r.previewUrl === 'string' && r.previewUrl.length > 0)
    .map((r) => ({
      id: r.trackId,
      trackName: r.trackName ?? 'Unknown Title',
      artistName: r.artistName ?? 'Unknown Artist',
      artworkUrl100: r.artworkUrl100 ?? '',
      primaryGenreName: r.primaryGenreName ?? genre,
      previewUrl: r.previewUrl,
      pool,
      sourceGenre: genre,
    }));
}

export function isMismatch(t: RatedTrack): boolean {
  return (t.pool === 'disliked' && t.rating >= 4) || (t.pool === 'liked' && t.rating <= 2);
}

export function formatSeconds(s: number | undefined | null): string {
  if (s == null || !isFinite(s)) return '0:00';
  const total = Math.max(0, Math.floor(s));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Builds a shuffled session queue mixing tracks from both pools so pool identity isn't guessable. */
export function buildSessionQueue(likedPool: PoolTrack[], dislikedPoolIn: PoolTrack[]): PoolTrack[] {
  // A track can't belong to both pools — liked wins ties.
  const likedIds = new Set(likedPool.map((t) => t.id));
  const dislikedPool = dislikedPoolIn.filter((t) => !likedIds.has(t.id));

  const shuffledLiked = shuffle(likedPool);
  const shuffledDisliked = shuffle(dislikedPool);

  const half = Math.floor(TRACKS_PER_SESSION / 2);
  let picked = [...shuffledLiked.slice(0, half), ...shuffledDisliked.slice(0, half)];

  const remaining = TRACKS_PER_SESSION - picked.length;
  if (remaining > 0) {
    const usedIds = new Set(picked.map((t) => t.id));
    const extras = shuffle([...shuffledLiked.slice(half), ...shuffledDisliked.slice(half)]).filter(
      (t) => !usedIds.has(t.id)
    );
    picked = [...picked, ...extras.slice(0, remaining)];
  }

  return shuffle(picked).slice(0, TRACKS_PER_SESSION);
}

// ---------- Persistence ----------
// All persistence is best-effort: a read/write failure falls back to an empty
// result rather than throwing, so a storage hiccup never crashes the UI.

export async function loadGenrePicks(): Promise<GenrePicks | null> {
  try {
    const raw = await AsyncStorage.getItem(GENRE_PICKS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.liked) || !Array.isArray(parsed?.disliked)) return null;
    return { liked: parsed.liked, disliked: parsed.disliked };
  } catch {
    return null;
  }
}

export async function saveGenrePicks(picks: GenrePicks): Promise<void> {
  try {
    await AsyncStorage.setItem(GENRE_PICKS_KEY, JSON.stringify(picks));
  } catch {
    // ignore
  }
}

export async function clearGenrePicks(): Promise<void> {
  try {
    await AsyncStorage.removeItem(GENRE_PICKS_KEY);
  } catch {
    // ignore
  }
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Appends one rated track to the all-time history. Never overwrites existing entries. */
export async function appendHistoryEntry(entry: HistoryEntry): Promise<void> {
  try {
    const existing = await loadHistory();
    existing.push(entry);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(existing));
  } catch {
    // ignore
  }
}
