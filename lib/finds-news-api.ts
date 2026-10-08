import type { DiscoveryTrack } from './discovery';
import {
  loadReleaseChecks,
  saveReleaseChecks,
  type ArtistRelease,
  type ReleaseChecks,
} from './discovery-storage';
import { pacedItunes } from './pool';

const MAX_ARTISTS_PER_SYNC = 8;

interface ItunesAlbumLookup {
  wrapperType?: string;
  collectionType?: string;
  collectionId?: number;
  collectionName?: string;
  releaseDate?: string;
  artworkUrl100?: string;
}

interface ItunesLookupResponse {
  results?: ItunesAlbumLookup[];
}

/** Fetches recent albums for an artist via iTunes lookup, paced through pool's pacer. */
/** null when the lookup failed, so the last good check is kept. */
export async function fetchArtistReleases(artistId: number): Promise<ArtistRelease[] | null> {
  try {
    const url = new URL('https://itunes.apple.com/lookup');
    url.searchParams.set('id', String(artistId));
    url.searchParams.set('entity', 'album');
    url.searchParams.set('sort', 'recent');
    url.searchParams.set('limit', '5');

    const body = (await pacedItunes(async () => {
      const res = await fetch(url);
      if (!res.ok) return null;
      return (await res.json()) as ItunesLookupResponse;
    })) as ItunesLookupResponse | null;

    if (!body) return null;
    const results = body.results ?? [];
    const releases: ArtistRelease[] = [];

    for (const r of results) {
      if (r.wrapperType === 'collection' && r.collectionId && r.releaseDate) {
        releases.push({
          collectionId: r.collectionId,
          collectionName: r.collectionName ?? '',
          releaseDate: r.releaseDate,
          artworkUrl100: r.artworkUrl100,
        });
      }
    }

    return releases;
  } catch {
    return null;
  }
}

/**
 * Checks up to 8 saved artists per session, oldest-checked first, caching in storage.
 * Runs in the background without blocking feed rendering.
 */
export async function syncReleaseChecks(likedTracks: DiscoveryTrack[]): Promise<ReleaseChecks> {
  try {
    const checks = await loadReleaseChecks();

    const uniqueArtistIds = [...new Set(likedTracks.map((t) => t.artistId).filter((id) => id > 0))];
    if (uniqueArtistIds.length === 0) return checks;

    // Oldest-checked first
    uniqueArtistIds.sort((a, b) => (checks[a]?.checkedAt ?? 0) - (checks[b]?.checkedAt ?? 0));
    const targetIds = uniqueArtistIds.slice(0, MAX_ARTISTS_PER_SYNC);

    let changed = false;
    for (const artistId of targetIds) {
      const releases = await fetchArtistReleases(artistId);
      if (!releases) continue;
      checks[artistId] = {
        checkedAt: Date.now(),
        releases,
      };
      changed = true;
    }

    if (changed) {
      await saveReleaseChecks(checks);
    }

    return checks;
  } catch {
    return {};
  }
}
