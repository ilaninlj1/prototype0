// Heard: every song you swiped, one row each, newest first, so a song stuck in your head two days
// later is still there to find, play and heart. Built from swipe history (lib/discovery-storage.ts);
// the Library resolves covers and previews by track id. Pure.

import type { DiscoveryTrack, SwipeEntry } from './discovery.ts';

export type HeardOutcome = 'saved' | 'revealed' | 'jumped' | 'skipped';

export type HeardSong = {
  /** What the swipe recorded; cover and preview are filled in by the Library. */
  track: DiscoveryTrack;
  /** The latest time you heard it. */
  at: number;
  outcome: HeardOutcome;
  /** The longest you listened. */
  listenMs: number;
  source?: SwipeEntry['source'];
};

const ACTION_OUTCOME: Partial<Record<SwipeEntry['action'], HeardOutcome>> = {
  like: 'saved',
  reveal: 'revealed',
  'genre-jump': 'jumped',
  skip: 'skipped',
};
const RANK: Record<HeardOutcome, number> = { saved: 3, revealed: 2, jumped: 1, skipped: 0 };

export function heardSongs(history: SwipeEntry[]): HeardSong[] {
  const byId = new Map<number, HeardSong>();
  for (const e of history) {
    const outcome = ACTION_OUTCOME[e.action];
    if (!outcome) continue; // steering never took the card away
    const prev = byId.get(e.trackId);
    const latest = !prev || e.timestamp >= prev.at;
    byId.set(e.trackId, {
      track:
        latest || !prev
          ? {
              id: e.trackId,
              trackName: e.trackName ?? prev?.track.trackName ?? '',
              artistId: e.artistId,
              artistName: e.artistName ?? prev?.track.artistName ?? '',
              artworkUrl100: '',
              primaryGenreName: e.genre,
              previewUrl: '',
              trackViewUrl: '',
              collectionName: null,
            }
          : prev.track,
      at: Math.max(prev?.at ?? 0, e.timestamp),
      outcome: prev && RANK[prev.outcome] > RANK[outcome] ? prev.outcome : outcome,
      listenMs: Math.max(prev?.listenMs ?? 0, e.listenMs ?? 0),
      source: latest ? e.source : prev?.source,
    });
  }
  return [...byId.values()].sort((a, b) => b.at - a.at);
}

const seconds = (ms: number) => `${Math.round(ms / 1000)}s`;

export function outcomeLine(s: HeardSong): string {
  if (s.source === 'run') return 'Played on a run';
  switch (s.outcome) {
    case 'saved':
      return 'Hearted';
    case 'revealed':
      return 'Revealed';
    case 'jumped':
      return `Left for a new genre after ${seconds(s.listenMs)}`;
    case 'skipped':
      return s.listenMs < 1000 ? 'Skipped right away' : `Skipped after ${seconds(s.listenMs)}`;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Songs grouped by the day you heard them (local time): "Today", "Yesterday", "Oct 26", "Dec 31, 2025". */
export function heardDays(songs: HeardSong[], now: number): { label: string; songs: HeardSong[] }[] {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now).setDate(new Date(now).getDate() - 1));
  const thisYear = new Date(now).getFullYear();
  const days: { key: string; label: string; songs: HeardSong[] }[] = [];
  for (const s of songs) {
    const key = dayKey(s.at);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      const d = new Date(s.at);
      const date = `${MONTHS[d.getMonth()]} ${d.getDate()}${d.getFullYear() === thisYear ? '' : `, ${d.getFullYear()}`}`;
      day = { key, label: key === today ? 'Today' : key === yesterday ? 'Yesterday' : date, songs: [] };
      days.push(day);
    }
    day.songs.push(s);
  }
  return days.map(({ label, songs: list }) => ({ label, songs: list }));
}
