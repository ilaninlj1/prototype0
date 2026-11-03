// The song decides its creature's body, down to the details, so no two songs look alike. Every trait comes from one
// measure of its sound, and the app can say which. Pure.

import type { SoundFeatures } from './sound.ts';

export type Anatomy = {
  /** Body proportions: danceable songs are round, others long and slender. */
  length: number;
  depth: number;
  /** Fin size: bright songs have big fins, dark ones small. */
  fin: number;
  /** Major keys fork, minor keys round off, no key known fans out. */
  tail: 'fork' | 'round' | 'fan';
  pattern: 'stripes' | 'spots' | 'lines' | 'band' | 'plain';
  /** How many stripes or marks, from the song's key. */
  marks: number;
  /** A puffer's spines, from how loud the song is. */
  spines: number;
  /** Talking or rapping: its mouth is open. */
  voice: boolean;
  /** A jellyfish's strands, from the song's key. */
  strands: number;
};

const round = (v: number) => Math.round(v * 20) / 20;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function anatomyOf(s: SoundFeatures | null): Anatomy {
  if (!s) return { length: 1, depth: 1, fin: 1, tail: 'fan', pattern: 'plain', marks: 0, spines: 12, voice: false, strands: 4 };
  const key = s.key ?? 0;
  return {
    length: round(1.25 - 0.45 * clamp01(s.danceability)),
    depth: round(0.8 + 0.55 * clamp01(s.danceability)),
    fin: round(0.65 + 0.85 * clamp01(s.valence)),
    tail: s.mode === 1 ? 'fork' : s.mode === 0 ? 'round' : 'fan',
    pattern: s.acousticness > 0.6 ? 'spots' : s.acousticness < 0.04 ? 'lines' : s.instrumentalness > 0.5 ? 'band' : s.key == null ? 'plain' : 'stripes',
    marks: s.key == null ? 0 : 1 + (key % 4),
    spines: Math.round(8 + clamp01((s.loudness + 16) / 14) * 10),
    voice: s.speechiness > 0.12,
    strands: 3 + (key % 4),
  };
}

export function anatomyKey(a: Anatomy): string {
  return [a.length, a.depth, a.fin, a.tail, a.pattern, a.marks, a.spines, a.voice ? 1 : 0, a.strands].join('/');
}

/** The body in plain words: the traits that stand out, at most three. */
export function anatomyLines(a: Anatomy): string[] {
  const lines: string[] = [];
  if (a.depth >= 1.2) lines.push('Round because the song is danceable.');
  else if (a.depth <= 0.95) lines.push('Slender because the song is not very danceable.');
  if (a.fin >= 1.2) lines.push('Big fins because the song sounds bright.');
  else if (a.fin <= 0.85) lines.push('Small fins because the song sounds dark.');
  if (a.pattern === 'spots') lines.push('Spots because the song is acoustic.');
  else if (a.pattern === 'lines') lines.push('Glowing lines because the song is electronic.');
  else if (a.pattern === 'band') lines.push('One wide band because the song is mostly instrumental.');
  else if (a.tail !== 'fan') lines.push(a.tail === 'fork' ? 'A forked tail because the song is in a major key.' : 'A round tail because the song is in a minor key.');
  if (a.voice && lines.length < 3) lines.push('Its mouth is open because there is talking or rapping.');
  return lines.slice(0, 3);
}
