// Taste Decoded: one honest sentence about your taste, backed by songs you can
// play. Every measure is judged against the song's own genre's normal sound
// (assets/genre-sound.json, built by scripts/measure-genre-sound.ts). Pure —
// measuring is lib/song-feel-api.ts; the screens are components/decoded/ and
// app/decoded.tsx. Spec: docs/superpowers/specs/2026-10-02-taste-decoded-design.md

import type { DiscoveryTrack, SwipeEntry } from './discovery';
import type { Baselines, Cuts, GenreSound } from './genre-sound';
import type { SongFeel } from './tasteform';

/** The 8 measurements findings use. Tempo is measured too but stays out: shaky on 30s clips. */
export const MEASURES = [
  'energy',
  'valence',
  'danceability',
  'acousticness',
  'instrumentalness',
  'liveness',
  'speechiness',
  'loudness',
] as const;
export type Measure = (typeof MEASURES)[number];
export type Side = 'low' | 'high';

export const SIDE_WORDS: Record<Measure, Record<Side, string>> = {
  energy: { low: 'calm', high: 'intense' },
  valence: { low: 'sad', high: 'happy' },
  danceability: { low: 'still', high: 'danceable' },
  acousticness: { low: 'electronic', high: 'acoustic' },
  instrumentalness: { low: 'vocal', high: 'instrumental' },
  liveness: { low: 'studio', high: 'live' },
  speechiness: { low: 'sung', high: 'rapped or spoken' },
  loudness: { low: 'quiet', high: 'loud' },
};

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

/** ReccoBeats' answer as a SongFeel, or null when it isn't one. Non-number extras are dropped. */
export function parseSongFeel(f: unknown): SongFeel | null {
  if (!f || typeof f !== 'object') return null;
  const o = f as Record<string, unknown>;
  const energy = num(o.energy);
  const valence = num(o.valence);
  if (energy == null || valence == null) return null;
  const feel: SongFeel = { energy, valence, tempo: num(o.tempo) ?? 0 };
  for (const m of MEASURES) {
    const v = num(o[m]);
    if (v != null) feel[m] = v;
  }
  return feel;
}

/** All 8 measurements present: only these songs count toward findings. */
export function isFullyMeasured(f: SongFeel | undefined): f is SongFeel & Record<Measure, number> {
  return !!f && MEASURES.every((m) => typeof f[m] === 'number');
}

// ---------- Positions ----------

const CUT_AT = [10, 25, 50, 75, 90];

/**
 * A value's percentile within a genre: straight-line between the cut points, 5 below the 10th, 95 above
 * the 90th. A value equal to several cut points takes the middle of them, so a typical value (say
 * instrumentalness 0 in a vocal genre) never reads as extreme.
 */
export function position(value: number, cuts: Cuts): number {
  if (value < cuts[0]) return 5;
  if (value > cuts[4]) return 95;
  const tied = CUT_AT.filter((_, i) => cuts[i] === value);
  if (tied.length) return (tied[0] + tied[tied.length - 1]) / 2;
  for (let i = 0; i < 4; i++) {
    if (value < cuts[i + 1]) return CUT_AT[i] + ((value - cuts[i]) / (cuts[i + 1] - cuts[i])) * (CUT_AT[i + 1] - CUT_AT[i]);
  }
  return 90; // not reached: value <= cuts[4] and not tied to it
}

/** Low at or below the 25th, high at or above the 75th; normal songs never count toward a side. */
export function sideOf(pos: number): Side | null {
  return pos <= 25 ? 'low' : pos >= 75 ? 'high' : null;
}

/** The first candidate the baselines know: pool songs carry the app's genres, iTunes labels usually match nothing. */
export function songGenre(candidates: (string | undefined)[], b: Baselines): string | null {
  return candidates.find((g): g is string => !!g && g in b.genres) ?? null;
}

export function baselineFor(genre: string | null, b: Baselines): GenreSound {
  return (genre != null && b.genres[genre]) || b.all;
}

// ---------- Findings ----------

/** A saved or test song with all 8 measurements, ready to judge. */
export type DecodedSong = {
  id: number;
  title: string;
  artist: string;
  artworkUrl: string;
  previewUrl: string;
  genre: string | null;
  feel: Record<Measure, number>;
};

export type FindingKind = 'never' | 'never-all' | 'genre' | 'across';

export type Finding = {
  /** `kind:genre:measure:side`; drives "new", votes and the Sunday ping. */
  id: string;
  kind: FindingKind;
  genre: string | null;
  measure: Measure;
  side: Side;
  sentence: string;
  /** The songs behind it, each at its 0–100 position (normal is 25–75). */
  evidence: { song: DecodedSong; position: number }[];
  strength: number;
};

export const findingId = (kind: FindingKind, genre: string | null, m: Measure, side: Side) => `${kind}:${genre ?? '*'}:${m}:${side}`;

const MIN_SHARE = 0.75;
/** More songs, more weight, up to 8. */
const weight = (n: number) => Math.min(n, 8) / 8;

/** Saved songs that are fully measured, with a genre from the swipe log first, then their own label. */
export function decodedSaves(liked: DiscoveryTrack[], history: SwipeEntry[], feels: Record<number, SongFeel>, b: Baselines): DecodedSong[] {
  const swipeGenre = new Map<number, string>();
  for (const e of history) swipeGenre.set(e.trackId, e.genre); // the latest swipe wins
  return liked.flatMap((t) => {
    const feel = feels[t.id];
    if (!isFullyMeasured(feel)) return [];
    const genre = songGenre([swipeGenre.get(t.id), t.primaryGenreName], b);
    return [{ id: t.id, title: t.trackName, artist: t.artistName, artworkUrl: t.artworkUrl100, previewUrl: t.previewUrl, genre, feel }];
  });
}

/** Every measure where at least 75% of the songs sit on one side, with all the songs placed as evidence. */
function lopsided(songs: DecodedSong[], against: (s: DecodedSong) => GenreSound) {
  const out: { measure: Measure; side: Side; share: number; evidence: Finding['evidence'] }[] = [];
  for (const m of MEASURES) {
    const evidence = songs.map((song) => ({ song, position: position(song.feel[m], against(song).cuts[m]) }));
    const low = evidence.filter((e) => sideOf(e.position) === 'low').length;
    const high = evidence.filter((e) => sideOf(e.position) === 'high').length;
    const share = Math.max(low, high) / songs.length;
    if (share >= MIN_SHARE) out.push({ measure: m, side: high > low ? 'high' : 'low', share, evidence });
  }
  return out;
}

/** "You don't just like Jazz. You like loud Jazz." — 3+ saves in a genre, 75%+ on one side of its normal. */
export function genreFindings(saves: DecodedSong[], b: Baselines): Finding[] {
  const byGenre = new Map<string, DecodedSong[]>();
  for (const s of saves) if (s.genre) byGenre.set(s.genre, [...(byGenre.get(s.genre) ?? []), s]);
  const out: Finding[] = [];
  for (const [genre, songs] of byGenre) {
    if (songs.length < 3) continue;
    for (const l of lopsided(songs, () => baselineFor(genre, b))) {
      const word = SIDE_WORDS[l.measure][l.side];
      out.push({
        id: findingId('genre', genre, l.measure, l.side),
        kind: 'genre',
        genre,
        measure: l.measure,
        side: l.side,
        sentence: `You don't just like ${genre}. You like ${word} ${genre}.`,
        evidence: l.evidence,
        strength: l.share * weight(songs.length),
      });
    }
  }
  return out;
}

/** "3 genres, one habit: everything you save is acoustic." — 6+ saves over 3+ genres, against the pooled row. */
export function acrossFindings(saves: DecodedSong[], b: Baselines): Finding[] {
  const genres = new Set(saves.flatMap((s) => (s.genre ? [s.genre] : [])));
  if (saves.length < 6 || genres.size < 3) return [];
  return lopsided(saves, () => b.all).map((l) => ({
    id: findingId('across', null, l.measure, l.side),
    kind: 'across' as const,
    genre: null,
    measure: l.measure,
    side: l.side,
    sentence: `${genres.size} genres, one habit: ${l.share === 1 ? 'everything' : 'almost everything'} you save is ${SIDE_WORDS[l.measure][l.side]}.`,
    evidence: l.evidence,
    strength: l.share * weight(saves.length),
  }));
}
