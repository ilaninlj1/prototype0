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
