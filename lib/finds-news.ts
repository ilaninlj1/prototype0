import type { CalledShot } from './called-shots.ts';
import type { DiscoveryTrack } from './discovery.ts';
import { describeMilestone } from './milestones.ts';

export type NewsSeenEntry = {
  listeners: number;
  seenAt: number;
};

export type NewsSeenState = Record<string, NewsSeenEntry>;

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

export type FindsNewsItem = {
  id: string;
  type: 'milestone' | 'release';
  artistName: string;
  artistId: number;
  track: DiscoveryTrack;
  sentence: string;
  called: boolean;
};

export function cleanReleaseTitle(title: string): string {
  return title
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*-\s*(single|ep|deluxe|remaster(ed)?)\b.*$/i, '')
    .trim();
}

export function describeRelease(artistName: string, title?: string): string {
  const clean = title ? cleanReleaseTitle(title) : '';
  return clean ? `${artistName} released ${clean}.` : `${artistName} released new music.`;
}

export type BuildFindsNewsParams = {
  likedTracks: DiscoveryTrack[];
  newsSeen: NewsSeenState;
  releaseChecks?: ReleaseChecks;
  listenersNow?: Record<string, number>;
  calls?: CalledShot[];
};

/**
 * Builds unseen news items from saved songs: milestone crossings and new releases.
 * Called artists appear first.
 */
export function buildFindsNews({
  likedTracks,
  newsSeen,
  releaseChecks = {},
  listenersNow = {},
  calls = [],
}: BuildFindsNewsParams): FindsNewsItem[] {
  const calledArtists = new Set(calls.map((c) => c.artistName));
  const calledTrackByArtist = new Map(calls.map((c) => [c.artistName, c.trackId]));

  // Pick one representative track per artist: prefer the called song, else newest saved
  const tracksByArtist = new Map<string, DiscoveryTrack>();
  for (let i = likedTracks.length - 1; i >= 0; i--) {
    const t = likedTracks[i];
    if (!tracksByArtist.has(t.artistName)) {
      tracksByArtist.set(t.artistName, t);
    }
  }

  for (const artistName of tracksByArtist.keys()) {
    const calledId = calledTrackByArtist.get(artistName);
    if (calledId) {
      const match = likedTracks.find((t) => t.id === calledId);
      if (match) tracksByArtist.set(artistName, match);
    }
  }

  const milestoneItems: FindsNewsItem[] = [];
  const releaseItems: FindsNewsItem[] = [];

  for (const [artistName, track] of tracksByArtist.entries()) {
    const isCalled = calledArtists.has(artistName);

    // 1. Milestones
    const seen = newsSeen[artistName];
    const before = seen ? seen.listeners : track.artistListeners;
    const now = listenersNow[artistName];
    const sentence = describeMilestone(artistName, before, now, track.artistListeners);
    if (sentence) {
      milestoneItems.push({
        id: `milestone:${artistName}`,
        type: 'milestone',
        artistName,
        artistId: track.artistId,
        track,
        sentence,
        called: isCalled,
      });
    }

    // 2. New releases
    const check = releaseChecks[track.artistId];
    if (check && Array.isArray(check.releases)) {
      const savedAt = track.likedAt ?? 0;
      const seenAt = seen?.seenAt ?? 0;
      for (const rel of check.releases) {
        const relTime = new Date(rel.releaseDate).getTime();
        if (Number.isFinite(relTime) && relTime > savedAt && relTime > seenAt) {
          releaseItems.push({
            id: `release:${track.artistId}:${rel.collectionId}`,
            type: 'release',
            artistName,
            artistId: track.artistId,
            track,
            sentence: describeRelease(artistName, rel.collectionName),
            called: isCalled,
          });
          break; // at most one release item per artist
        }
      }
    }
  }

  const items = [...milestoneItems, ...releaseItems];
  items.sort((a, b) => {
    if (a.called !== b.called) return a.called ? -1 : 1;
    return 0;
  });

  return items;
}

/** Pure helper to advance newsSeen state when closing the news sheet. */
export function markNewsSeen(
  currentSeen: NewsSeenState,
  items: FindsNewsItem[],
  listenersNow: Record<string, number> = {},
  now = Date.now()
): NewsSeenState {
  const next: NewsSeenState = { ...currentSeen };
  for (const item of items) {
    const listeners = listenersNow[item.artistName] ?? item.track.artistListeners ?? next[item.artistName]?.listeners ?? 0;
    next[item.artistName] = {
      listeners,
      seenAt: now,
    };
  }
  return next;
}
