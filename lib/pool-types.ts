// Shared types for the pool-steering control (presets A-D). Imported by the
// Phase 0 seed script (scripts/seed-genres.ts) and, from Phase 1 on, by
// lib/pool.ts. Kept in its own file — rather than folded into pool.ts the
// way lib/taste-test.ts keeps types+logic together — because two independent
// entry points (a Node CLI script and the app's data layer) need these
// without pulling in either one's runtime code.

// 'M' (Mixed) added 2026-09-15: no band filtering, draws from a genre's
// whole population — the neutral baseline the other four presets are
// compared against. A Mixed-drawn track still has a real ArtistBand/
// SongBand (whichever it actually is) — Mixed changes the SELECTION
// criteria, not what a track IS, so neither ArtistBand nor SongBand needed
// a corresponding third value.
export type PresetId = 'A' | 'B' | 'C' | 'D' | 'M';
export type ArtistBand = 'popular' | 'obscure';
export type SongBand = 'hit' | 'deepcut';

/** Pre-filter. previewUrl may be missing — never reaches the deck. */
export interface Candidate {
  artist: string;
  title: string;
  previewUrl: string | null;
}

/** Post-filter. previewUrl is non-nullable by construction. */
export interface Track {
  id: string; // `${normArtist}::${normTitle}`
  artist: string;
  title: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string; // guaranteed
  source: {
    preset: PresetId;
    genreTag: string;
    artistListeners: number;
    artistPlaycount: number;
    artistBand: ArtistBand;
    trackRank: number;
    trackCountInCatalog: number;
    trackPlaycount: number | null;
    songBand: SongBand;
    itunesTrackId: number;
    // Added 2026-09-15, not in the original spec: Phase 2's card deck
    // reuses lib/discovery.ts's SwipeCard/CardStack unmodified (decided in
    // this project's C6), and DiscoveryTrack.artistId is a required numeric
    // field — used by artist-steering ("more from this artist") and by
    // Profile's deriveTopArtists. A Track needs its own resolved iTunes
    // artistId to bridge into that shape; scripts/resolve-itunes-ids.ts
    // already resolves this per artist ahead of Phase 1, so it's free once
    // Phase 1 reads the seed.
    itunesArtistId: number;
  };
}

/**
 * The fields lib/pool.ts actually reads from each entry of
 * assets/genres.json. Deliberately redeclared here rather than imported
 * from scripts/band-genres.ts's SeedArtist (dev-only tooling, not shipped
 * — lib/ has no dependency on scripts/, even a type-only one) — the real
 * JSON has more fields (mbid, minPage, itunesArtistName, itunesResolvedVia)
 * that nothing in the app needs, so this only lists what's consumed.
 */
export interface SeedArtistEntry {
  name: string;
  listeners: number;
  playcount: number;
  band: ArtistBand;
  itunesArtistId: number | null;
}

/**
 * One playable, already-title-matched track as scripts/precompute-catalogs.ts
 * stores it — the same shape lib/pool.ts's own IntersectedCandidate carries,
 * minus the fields nothing downstream of the precompute step needs.
 * previewUrl is non-nullable: the precompute step only ever stores a
 * candidate it already filtered for a truthy previewUrl.
 */
export interface CatalogEntry {
  title: string;
  rank: number;
  playcount: number | null;
  previewUrl: string;
  itunesTrackId: number;
  artworkUrl: string | null;
  album: string | null;
}

/**
 * One artist's precomputed shortlist (assets/catalogs/<genre-slug>.json
 * values, written by scripts/precompute-catalogs.ts, read by
 * lib/pool.ts's catalog fast path). hits/deepCuts/mixed mirror
 * lib/pool.ts's own selection bands (hitRankMax / deepCutRelativeFloor —
 * see lib/pool-config.ts) computed once at seed time instead of per deck
 * fill; mixed is a separate rank-spread sample (not hits ∪ deepCuts) so
 * preset 'M' isn't narrowed to only the tracks the other four presets
 * care about. rankedTrackCount is the artist's full Last.fm-ranked track
 * count — needed for Track.source.trackCountInCatalog and for the same
 * deepCutMinTrackCount skip lib/pool.ts's live-fetch path applies, since
 * it isn't recoverable from deepCuts.length alone (that's already
 * post-filtered to playable tracks).
 */
export interface ArtistCatalog {
  hits: CatalogEntry[];
  deepCuts: CatalogEntry[];
  mixed: CatalogEntry[];
  rankedTrackCount: number;
}

/** assets/catalogs/<genre-slug>.json's shape: artist name -> its catalog. */
export type GenreCatalogFile = Record<string, ArtistCatalog>;
