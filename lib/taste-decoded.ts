// Taste Decoded: one honest sentence about your taste, backed by songs you can
// play. Every measure is judged against the song's own genre's normal sound
// (assets/genre-sound.json, built by scripts/measure-genre-sound.ts). Pure —
// measuring is lib/song-feel-api.ts; the screens are components/decoded/ and
// app/decoded.tsx. Spec: docs/superpowers/specs/2026-10-02-taste-decoded-design.md

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
