// Taste Decoded: one honest sentence about your taste, backed by songs you can
// play. Every measure is judged against the song's own genre's normal sound
// (assets/genre-sound.json, built by scripts/measure-genre-sound.ts). Pure —
// measuring is lib/song-feel-api.ts; the screens are components/decoded/ and
// app/decoded.tsx. Spec: docs/superpowers/specs/2026-10-02-taste-decoded-design.md

import { listGenres, type BlindTestSong } from './blind-test.ts';
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

// ---------- Never, decoded ----------

export type NeverSong = DecodedSong & { liked: boolean };

/** The Blind Spot Test's never-songs that are fully measured. A genre the baselines left out gets null (placed against `all`). */
export function decodedNevers(songs: BlindTestSong[], feels: Record<number, SongFeel>, b: Baselines): NeverSong[] {
  return songs.flatMap((s) => {
    const feel = feels[s.trackId];
    if (!s.isNever || !isFullyMeasured(feel)) return [];
    const genre = songGenre([s.genre], b);
    return [{ id: s.trackId, title: s.title, artist: s.artist, artworkUrl: s.artworkUrl, previewUrl: s.previewUrl, genre, feel, liked: s.liked }];
  });
}

const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
const MIN_GAP = 25;

/**
 * "You don't hate Country. You hate happy Country." — 2+ measured likes and 1+ measured skip among your
 * nevers, every like on one side of every skip, averages 25+ points apart. Or, when you liked all of them:
 * "…then liked all 5. Every one was instrumental." (4+ on one side).
 */
export function neverFindings(test: { never: string[]; songs: BlindTestSong[] }, feels: Record<number, SongFeel>, b: Baselines): Finding[] {
  const nevers = decodedNevers(test.songs, feels, b);
  const liked = nevers.filter((s) => s.liked);
  const skipped = nevers.filter((s) => !s.liked);
  const allNevers = test.songs.filter((s) => s.isNever);
  const genres = listGenres(test.never);
  const place = (s: DecodedSong, m: Measure) => position(s.feel[m], baselineFor(s.genre, b).cuts[m]);
  const evidence = (m: Measure) => nevers.map((song) => ({ song, position: place(song, m) }));
  const out: Finding[] = [];
  if (liked.length >= 2 && skipped.length >= 1) {
    for (const m of MEASURES) {
      const pl = liked.map((s) => place(s, m));
      const ps = skipped.map((s) => place(s, m));
      const split = Math.min(...pl) > Math.max(...ps) || Math.max(...pl) < Math.min(...ps);
      const gap = mean(pl) - mean(ps);
      if (!split || Math.abs(gap) < MIN_GAP) continue;
      const hated: Side = gap > 0 ? 'low' : 'high'; // the skipped songs' side
      out.push({
        id: findingId('never', genres, m, hated),
        kind: 'never',
        genre: genres,
        measure: m,
        side: hated,
        sentence: `You don't hate ${genres}. You hate ${SIDE_WORDS[m][hated]} ${genres}.`,
        evidence: evidence(m),
        strength: Math.abs(gap) / 100,
      });
    }
  } else if (allNevers.length > 0 && allNevers.every((s) => s.liked) && nevers.length >= 4) {
    for (const m of MEASURES) {
      const sides = nevers.map((s) => sideOf(place(s, m)));
      for (const side of ['low', 'high'] as const) {
        const k = sides.filter((x) => x === side).length;
        if (k < 4) continue;
        out.push({
          id: findingId('never-all', genres, m, side),
          kind: 'never-all',
          genre: genres,
          measure: m,
          side,
          sentence: `You said never ${genres}, then liked all ${allNevers.length}. ${k === nevers.length ? 'Every one was' : `${k} of ${nevers.length} were`} ${SIDE_WORDS[m][side]}.`,
          evidence: evidence(m),
          strength: k / nevers.length,
        });
      }
    }
  }
  return out;
}

// ---------- Everything together ----------

export type DecodeInput = {
  liked: DiscoveryTrack[];
  history: SwipeEntry[];
  feels: Record<number, SongFeel>;
  test: { never: string[]; songs?: BlindTestSong[] } | null;
};

const byStrength = (a: Finding, z: Finding) => z.strength - a.strength || z.evidence.length - a.evidence.length;

/** At most 3 findings, no two on the same measure; the strongest Never, decoded always leads. */
export function decodeTaste(input: DecodeInput, b: Baselines): Finding[] {
  const saves = decodedSaves(input.liked, input.history, input.feels, b);
  const never = input.test?.songs ? neverFindings({ never: input.test.never, songs: input.test.songs }, input.feels, b) : [];
  const ranked = [...never.sort(byStrength).slice(0, 1), ...[...genreFindings(saves, b), ...acrossFindings(saves, b)].sort(byStrength)];
  const out: Finding[] = [];
  for (const f of ranked) if (out.length < 3 && !out.some((o) => o.measure === f.measure)) out.push(f);
  return out;
}

/** What the Decoded line says before anything speaks. Counts saves, not measured saves, so it never asks for more while measuring catches up. */
export function decodedPrompt(saved: number, test: { songs?: BlindTestSong[] } | null): { text: string; takeTest: boolean } {
  if (!test?.songs) return { text: 'Take the Blind Spot Test to decode your nevers.', takeTest: true };
  if (saved < 3) {
    const n = 3 - saved;
    return { text: `Save ${n} more ${n === 1 ? 'song' : 'songs'} to decode your taste.`, takeTest: false };
  }
  return { text: 'Keep saving. Nothing stands out yet.', takeTest: false };
}

/** The strongest finding not opened on the Decoded page yet. */
export function unseenFinding(findings: Finding[], seen: string[]): Finding | null {
  return findings.find((f) => !seen.includes(f.id)) ?? null;
}

// ---------- Votes ----------

/** "Sounds like me" / "Nope" per finding id, and whether the first one reached the server. */
export type DecodedVotes = Record<string, { agree: boolean; sent: boolean }>;

/** Records a tap. Only a finding's first vote is sent; later taps change only what this phone shows. */
export function nextVote(votes: DecodedVotes, id: string, agree: boolean): { votes: DecodedVotes; send: boolean } {
  const sent = votes[id]?.sent ?? false;
  return { votes: { ...votes, [id]: { agree, sent } }, send: !sent };
}

export function markSent(votes: DecodedVotes, id: string): DecodedVotes {
  return votes[id] ? { ...votes, [id]: { ...votes[id], sent: true } } : votes;
}
