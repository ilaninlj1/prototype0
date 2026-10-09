// Match song titles and artists to Deezer recordings without crossing versions.
// Pure name cleanup and ISRC lookup for measured sound.

import { parseReccoRow } from './sound.ts';
import type { SoundFeatures } from './sound.ts';

export type DeezerHit = {
  title: string;
  title_short?: string;
  isrc?: string;
  artist: { name: string };
};

export function cleanTitle(title: string): string {
  return title.replace(/\([^)]*\)|\[[^\]]*\]/g, '').split(' - ')[0].replace(/\s+/g, ' ').trim();
}

export function normName(s: string): string {
  return s.normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/ +/g, ' ')
    .trim();
}

export function sameArtist(a: string, b: string): boolean {
  return normName(a) === normName(b);
}

export function deezerQuery(title: string, artist: string): string {
  return `${cleanTitle(title)} ${artist}`;
}

const VERSION_WORDS = ['live', 'remix', 'acoustic', 'instrumental', 'karaoke', 'sped up', 'slowed'];

function versions(title: string): string[] {
  const name = ` ${normName(title)} `;
  return VERSION_WORDS.filter((word) => name.includes(` ${word} `));
}

export function pickDeezerMatch(title: string, artist: string, hits: DeezerHit[]): DeezerHit | null {
  const ours = normName(cleanTitle(title));
  const version = versions(title).join(',');
  const candidates = hits
    .filter((hit) => hit.isrc && sameArtist(artist, hit.artist.name) && versions(hit.title).join(',') === version)
    .map((hit) => ({ hit, title: normName(cleanTitle(hit.title_short ?? hit.title)) }));
  return candidates.find((candidate) => candidate.title === ours)?.hit
    ?? (ours ? candidates.find((candidate) => candidate.title && (candidate.title.includes(ours) || ours.includes(candidate.title)))?.hit : undefined)
    ?? null;
}

export function featuresByIsrc(rows: unknown[]): Map<string, SoundFeatures> {
  const byIsrc = new Map<string, SoundFeatures>();
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || !('isrc' in row) || typeof row.isrc !== 'string') continue;
    const features = parseReccoRow(row);
    if (features === null) continue;
    const isrc = row.isrc.toUpperCase();
    if (!byIsrc.has(isrc)) byIsrc.set(isrc, features);
  }
  return byIsrc;
}
