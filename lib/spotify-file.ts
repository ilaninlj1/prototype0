/**
 * Spotify songs from a file: the CSV (or ZIP of CSVs) that exportify.app makes. Anyone can
 * export there with no 5-user cap, because Exportify runs on Spotify access granted before
 * the 2026 limits. The file is the user's own; it's read on the phone and never uploaded.
 *
 * Exportify's 19 columns include "Added By" and "Added At", the date each song was liked or
 * added, plus "Popularity" and "Album Release Date", which the You page's stats use.
 */
import { strFromU8, unzipSync } from 'fflate';

import { mergeSaves, type SpotifyLike } from './spotify.ts';

export type NamedText = { name: string; text: string };

/** RFC 4180 CSV: quoted fields can hold commas, doubled quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

type Row = Record<string, string>;

function table(text: string): Row[] | null {
  const [head, ...body] = parseCsv(text.replace(/^﻿/, ''));
  if (!head?.includes('Track URI') || !head.includes('Added At')) return null;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

/** "Road_Trip.csv" -> "Road Trip". */
const playlistName = (file: string) =>
  file
    .replace(/^.*\//, '')
    .replace(/\.csv$/i, '')
    .replace(/_/g, ' ')
    .trim();

function toSong(r: Row, from: string): SpotifyLike | null {
  const id = r['Track URI'].replace(/^spotify:track:/, '');
  const addedAt = Date.parse(r['Added At']);
  if (!id || !r['Track URI'].startsWith('spotify:track:') || Number.isNaN(addedAt)) return null;
  const year = parseInt(r['Album Release Date'], 10);
  const popularity = parseInt(r['Popularity'], 10);
  return {
    id,
    name: r['Track Name'],
    // Exportify joins several artists with a bare comma.
    artist: r['Artist Name(s)']
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
      .join(', '),
    art: r['Album Image URL'] ?? '',
    addedAt,
    from,
    source: 'file',
    ...(Number.isNaN(popularity) ? {} : { popularity }),
    ...(Number.isNaN(year) ? {} : { released: year }),
  };
}

/**
 * Every song from the files, each once (see mergeSaves). A file whose rows have no "Added By"
 * is Liked Songs. In playlist files only your own adds count, and "you" is whoever added the
 * most songs across all of them: a followed playlist's songs were added by someone else.
 */
export function fileSongs(files: NamedText[]): SpotifyLike[] {
  const tables = files.flatMap((f) => {
    const rows = table(f.text);
    return rows ? [{ name: f.name, rows }] : [];
  });
  const adders = new Map<string, number>();
  for (const t of tables)
    for (const r of t.rows) if (r['Added By']) adders.set(r['Added By'], (adders.get(r['Added By']) ?? 0) + 1);
  const me = [...adders].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const songs: SpotifyLike[] = [];
  for (const t of tables) {
    const liked = t.rows.every((r) => !r['Added By']);
    for (const r of t.rows) {
      if (!liked && r['Added By'] !== me) continue;
      const song = toSong(r, liked ? '' : playlistName(t.name));
      if (song) songs.push(song);
    }
  }
  return mergeSaves(songs);
}

export type ExportRead = { songs: SpotifyLike[]; problem?: 'empty' | 'not-exportify' };

/** What a picked file (or files) holds, or why it can't be used. */
export function readExport(files: NamedText[]): ExportRead {
  if (!files.length) return { songs: [], problem: 'empty' };
  if (!files.some((f) => table(f.text))) return { songs: [], problem: 'not-exportify' };
  return { songs: fileSongs(files) };
}

/** The CSV files inside Exportify's "export everything" ZIP (skipping macOS's __MACOSX copies). */
export function filesFromZip(bytes: Uint8Array): NamedText[] {
  const entries = unzipSync(bytes, { filter: (f) => /\.csv$/i.test(f.name) && !f.name.startsWith('__MACOSX/') });
  return Object.entries(entries).map(([name, data]) => ({ name, text: strFromU8(data) }));
}
