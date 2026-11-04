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
export function parseCsv(text: string, delimiter = ','): string[][] {
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
    else if (c === delimiter) {
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
/** A row and where it sits in a spreadsheet: the header is row 1, so the first song is row 2. */
type Numbered = { at: number; cells: Row };

/** Spotify's own stand-ins for a song it no longer knows, plus what data tools leave behind. "Unknown" alone can be a real song. */
const PLACEHOLDERS = new Set(['unknown artist', 'unknown track', 'null', 'undefined', 'n/a']);

/** A field as plain text: spaces tidied, control characters out, and a placeholder counts as blank. */
export function cleanField(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  return PLACEHOLDERS.has(text.toLowerCase()) ? '' : text;
}

const hasExportifyColumns = (head: string[] | undefined) => !!head?.includes('Track URI') && head.includes('Added At');

/** An odd number of quote marks: one never closes, so the parser took the rest of the file as a single field. */
export const hasUnclosedQuote = (text: string) => (text.match(/"/g)?.length ?? 0) % 2 === 1;
export const unclosedQuoteNote = (row: number) =>
  `A quote mark in this file never closes around row ${row}, so that row and everything after it couldn’t be read.`;

function table(text: string): { rows: Numbered[]; note?: string } | null {
  const [head, ...body] = parseCsv(text.replace(/^\uFEFF/, ''));
  if (!hasExportifyColumns(head)) return null;
  const unclosed = hasUnclosedQuote(text);
  if (unclosed) body.pop();
  const rows = body
    .map((r, i) => ({ r, at: i + 2 }))
    .filter(({ r }) => r.length > 1)
    .map(({ r, at }) => ({ at, cells: Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])) }));
  return { rows, ...(unclosed ? { note: unclosedQuoteNote(body.length + 2) } : {}) };
}

/** Whether this text is an Exportify export, from its first line. */
export const isExportify = (text: string) => hasExportifyColumns(parseCsv(text.replace(/^\uFEFF/, '').split(/\r|\n/, 1)[0])[0]);

/** "Road_Trip.csv" -> "Road Trip". */
const playlistName = (file: string) =>
  file
    .replace(/^.*\//, '')
    .replace(/\.csv$/i, '')
    .replace(/_/g, ' ')
    .trim();

export type SkipReason = 'no-title' | 'no-artist' | 'bad-date' | 'no-link' | 'empty' | 'not-a-song' | 'not-an-entry' | 'bad-columns';
export type RowSkip = { reason: SkipReason; at: number; name: string; artist: string };

function toSong(r: Row, from: string): SpotifyLike | SkipReason {
  const name = cleanField(r['Track Name']);
  const artist = cleanField(r['Artist Name(s)'])
    // Exportify joins several artists with a bare comma.
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
    .join(', ');
  if (!name && !artist) return 'empty';
  const id = r['Track URI'].replace(/^spotify:track:/, '');
  if (!id || !r['Track URI'].startsWith('spotify:track:')) return 'no-link';
  if (!name) return 'no-title';
  if (!artist) return 'no-artist';
  const addedAt = Date.parse(r['Added At']);
  if (Number.isNaN(addedAt)) return 'bad-date';
  const year = parseInt(r['Album Release Date'], 10);
  const popularity = parseInt(r['Popularity'], 10);
  return {
    id,
    name,
    artist,
    art: r['Album Image URL'] ?? '',
    addedAt,
    from,
    source: 'file',
    ...(Number.isNaN(popularity) ? {} : { popularity }),
    ...(Number.isNaN(year) ? {} : { released: year }),
  };
}

export type ExportifyFile = { name: string; rows: number; songs: SpotifyLike[]; skips: RowSkip[]; notYours: number; note?: string };

/**
 * What each Exportify file holds, row by row. A file whose rows have no "Added By" is Liked
 * Songs. In playlist files only your own adds count, and "you" is whoever added the most songs
 * across all of them: a followed playlist's songs were added by someone else.
 */
export function readExportify(files: NamedText[]): ExportifyFile[] {
  const tables = files.flatMap((f) => {
    const read = table(f.text);
    return read ? [{ name: f.name, ...read }] : [];
  });
  const adders = new Map<string, number>();
  for (const t of tables)
    for (const { cells } of t.rows) if (cells['Added By']) adders.set(cells['Added By'], (adders.get(cells['Added By']) ?? 0) + 1);
  const me = [...adders].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return tables.map((t) => {
    const out: ExportifyFile = { name: t.name, rows: t.rows.length, songs: [], skips: [], notYours: 0, ...(t.note ? { note: t.note } : {}) };
    const liked = t.rows.every(({ cells }) => !cells['Added By']);
    for (const { at, cells } of t.rows) {
      if (!liked && cells['Added By'] !== me) {
        out.notYours++;
        continue;
      }
      const song = toSong(cells, liked ? '' : playlistName(t.name));
      if (typeof song === 'string')
        out.skips.push({ reason: song, at, name: cleanField(cells['Track Name']), artist: cleanField(cells['Artist Name(s)']) });
      else out.songs.push(song);
    }
    return out;
  });
}

/** Every song from the files, each once (see mergeSaves). */
export function fileSongs(files: NamedText[]): SpotifyLike[] {
  return mergeSaves(readExportify(files).flatMap((f) => f.songs));
}

/** More than a phone should hold in memory at once, for one file or for everything in a ZIP. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

/**
 * The CSV and JSON files inside a ZIP: Exportify's "export everything" or Spotify's account data (skipping
 * macOS's __MACOSX copies). A small ZIP can unpack huge, so sizes are checked first and what won't fit is named.
 */
export function filesFromZip(bytes: Uint8Array, maxBytes = MAX_FILE_BYTES): (NamedText | { name: string; tooBig: true })[] {
  const tooBig: string[] = [];
  let total = 0;
  const entries = unzipSync(bytes, {
    filter: (f) => {
      if (!/\.(csv|json)$/i.test(f.name) || f.name.startsWith('__MACOSX/')) return false;
      if (total + f.originalSize > maxBytes) {
        tooBig.push(f.name);
        return false;
      }
      total += f.originalSize;
      return true;
    },
  });
  return [
    ...Object.entries(entries).map(([name, data]) => ({ name, text: strFromU8(data) })),
    ...tooBig.map((name) => ({ name, tooBig: true as const })),
  ];
}
