// Measured sound for the index, Tasteform and song Details.
// Pure parsing, compact rows and plain-language labels.

import type { SongFeel } from './tasteform.ts';

export type SoundFeatures = {
  tempo: number;
  key: number | null;
  mode: 0 | 1 | null;
  energy: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  liveness: number;
  valence: number;
  loudness: number;
};

export type SoundRecord =
  | { status: 'measured'; features: SoundFeatures; source: 'index' | 'live'; isrc?: string; at: number }
  | { status: 'unmatched'; at: number };

export const INDEX_FIELDS = [
  'tempo', 'key', 'mode', 'energy', 'danceability', 'acousticness',
  'instrumentalness', 'speechiness', 'liveness', 'valence', 'loudness',
] as const;

export const KEY_NAMES: readonly string[] = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validKey(value: unknown): value is number {
  return finiteNumber(value) && Number.isInteger(value) && value >= 0 && value <= 11;
}

export function parseReccoRow(row: unknown): SoundFeatures | null {
  if (row === null || typeof row !== 'object') return null;
  const {
    tempo, key, mode, energy, danceability, acousticness,
    instrumentalness, speechiness, liveness, valence, loudness,
  } = row as Record<string, unknown>;
  if (
    !finiteNumber(tempo) || !finiteNumber(energy) || !finiteNumber(danceability) ||
    !finiteNumber(acousticness) || !finiteNumber(instrumentalness) || !finiteNumber(speechiness) ||
    !finiteNumber(liveness) || !finiteNumber(valence) || !finiteNumber(loudness)
  ) return null;
  return {
    tempo,
    key: validKey(key) ? key : null,
    mode: mode === 0 || mode === 1 ? mode : null,
    energy, danceability, acousticness, instrumentalness, speechiness, liveness, valence, loudness,
  };
}

export function toIndexRow(f: SoundFeatures): number[] {
  return INDEX_FIELDS.map((field) => Math.round((f[field] ?? -1) * 1000) / 1000);
}

export function fromIndexRow(row: unknown): SoundFeatures | null {
  if (!Array.isArray(row) || row.length !== INDEX_FIELDS.length) return null;
  if (!INDEX_FIELDS.every((_, i) => finiteNumber(row[i]))) return null;
  if (row[1] !== -1 && !validKey(row[1])) return null;
  if (row[2] !== -1 && row[2] !== 0 && row[2] !== 1) return null;
  return parseReccoRow(Object.fromEntries(INDEX_FIELDS.map((field, i) => [field, row[i]])));
}

export function toSongFeel(f: SoundFeatures): SongFeel {
  const { energy, valence, tempo, danceability, acousticness, instrumentalness, liveness, speechiness, loudness } = f;
  return { energy, valence, tempo, danceability, acousticness, instrumentalness, liveness, speechiness, loudness };
}

export function keyLabel(key: number | null, mode: 0 | 1 | null): string | null {
  if (!validKey(key)) return null;
  const name = KEY_NAMES[key];
  return mode === null ? name : `${name} ${mode === 1 ? 'major' : 'minor'}`;
}

function pace(tempo: number): string {
  return tempo < 90 ? 'Slow' : tempo < 120 ? 'Mid-tempo' : 'Fast';
}

function isLoud(f: SoundFeatures): boolean {
  return f.energy >= 0.7 && f.loudness >= -8;
}

export function describeSound(f: SoundFeatures): string[] {
  const lines = [`${pace(f.tempo)} · ${Math.round(f.tempo)} BPM`];
  const key = keyLabel(f.key, f.mode);
  if (key !== null) lines.push(key);
  lines.push(isLoud(f) ? 'Loud and dense' : f.energy < 0.35 ? 'Quiet and sparse' : 'Medium energy');
  if (f.instrumentalness > 0.5) lines.push('Mostly instrumental');
  if (f.speechiness > 0.33) lines.push('Lots of talking or rap');
  if (f.acousticness > 0.6) lines.push('Acoustic');
  return lines;
}

export function moreLikeLabel(f: SoundFeatures): string {
  const parts = [pace(f.tempo).toLowerCase()];
  if (isLoud(f)) parts.push('loud');
  else if (f.energy < 0.35) parts.push('quiet');
  const key = keyLabel(f.key, f.mode);
  if (key !== null) parts.push(key);
  return parts.join(', ');
}
