/**
 * Bringing your songs in from a file: an Exportify export, Spotify's own listening history or
 * library, or any list with song and artist columns. Everything here works on text that has
 * already been read, so it can be tested without a phone. Nothing is thrown: every file and
 * every row ends up either as a song or as a plain reason it isn't one.
 */
import { cleanField, isExportify, parseCsv, readExportify, type RowSkip, type SkipReason } from './spotify-file.ts';
import { mergeSaves, type SpotifyLike } from './spotify.ts';

export type PickedFile = {
  name: string;
  text?: string;
  /** Couldn't be read off the phone at all. */
  failed?: 'unreadable' | 'too-big' | 'empty-zip';
  /** One file among many in a ZIP: it stays quiet if it holds no songs and another file worked. */
  fromZip?: boolean;
};

export type FileResult = {
  name: string;
  kind?: string;
  /** Songs this file gave, before repeats are folded together. */
  found: number;
  /** Why nothing could be used from it. */
  problem?: string;
  /** Something worth saying about a file that did work. */
  note?: string;
};

export type SkipGroup = { reason: SkipReason; text: string; count: number; rows: string[] };

export type ImportReport = {
  songs: SpotifyLike[];
  skipped: SkipGroup[];
  skippedCount: number;
  leftOut: { shortPlays: number; notYours: number; repeats: number };
  files: FileResult[];
  saveFailed?: boolean;
};

const SKIP_TEXT: Record<SkipReason, string> = {
  'no-title': 'No song name',
  'no-artist': 'No artist',
  'bad-date': 'Date isn’t a real date',
  'no-link': 'A local file or a removed song, with no Spotify link',
  'not-a-song': 'A podcast or audiobook, not a song',
  empty: 'Blank, or marked Unknown',
  'not-an-entry': 'Not a song entry',
  'bad-columns': 'Too many columns, maybe a comma with no quotes around it',
};

/** Enough to check a file by eye, without holding every row of a huge one. */
const ROWS_KEPT = 50;
/** Spotify's own line for a play that counts. A quick skip doesn't mean you know the song. */
const SHORT_PLAY_MS = 30_000;

// ---------- Dates ----------

const EARLIEST = Date.UTC(1995, 0, 1);
const DAY_MS = 86_400_000;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthOf = (word: string) => MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1;

/** A UTC time from its parts, or null for a day that doesn't exist (Date.UTC would roll it over). */
function utc(y: number, mo: number, d: number, h = 0, min = 0, s = 0): number | null {
  const at = Date.UTC(y, mo - 1, d, h, min, s);
  const date = new Date(at);
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || h > 23 || min > 59 || s > 59) return null;
  return at;
}

function readDateText(text: string): number | null {
  if (/^\d{10}$/.test(text)) return Number(text) * 1000;
  if (/^\d{13}$/.test(text)) return Number(text);
  // 2021-03-14, 2023-01-05 14:33, 2021-03-14T10:00:00Z, 2021-03-14T10:00:00.5+02:00
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/.exec(text);
  if (m) {
    const at = utc(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
    const zone = m[7] && m[7] !== 'Z' ? /([+-])(\d{2}):?(\d{2})/.exec(m[7]) : null;
    if (at == null || !zone) return at;
    return at - (zone[1] === '-' ? -1 : 1) * (+zone[2] * 60 + +zone[3]) * 60_000;
  }
  // 5/6/2019 reads as May 6; 25/12/2020 can only be a day first.
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?$/.exec(text);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    return a > 12 ? utc(+m[3], b, a, +(m[4] ?? 0), +(m[5] ?? 0)) : utc(+m[3], a, b, +(m[4] ?? 0), +(m[5] ?? 0));
  }
  // 05 Jan 2023, 14:33 (Last.fm)
  m = /^(\d{1,2}) ([A-Za-z]{3,}) (\d{4})(?:,? (\d{1,2}):(\d{2}))?$/.exec(text);
  if (m && monthOf(m[2])) return utc(+m[3], monthOf(m[2]), +m[1], +(m[4] ?? 0), +(m[5] ?? 0));
  // Jan 5, 2023
  m = /^([A-Za-z]{3,}) (\d{1,2}),? (\d{4})$/.exec(text);
  if (m && monthOf(m[1])) return utc(+m[3], monthOf(m[1]), +m[2]);
  return null;
}

/**
 * The time in a date field, or null if it can't be right. Parsed by hand because Date.parse
 * differs between phones' JS engines for anything but full ISO times. Times with no zone are
 * taken as UTC, as Spotify writes them. The future and 1970 (an empty date in many tools) are refused.
 */
export function parseWhen(value: unknown, now: number): number | null {
  let at: number | null = null;
  if (typeof value === 'number') at = value > 1e11 ? value : value * 1000;
  else if (typeof value === 'string') at = readDateText(value.trim());
  else if (value && typeof value === 'object' && 'uts' in value) at = readDateText(String(value.uts).trim());
  if (at == null || !Number.isFinite(at) || at < EARLIEST || at > now + DAY_MS) return null;
  return at;
}

// ---------- Fields, whatever a file calls them ----------

const norm = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const TITLE = ['title', 'track', 'trackname', 'tracktitle', 'song', 'songname', 'songtitle', 'mastermetadatatrackname', 'name'];
const ARTIST = ['artist', 'artistname', 'artists', 'artistnames', 'albumartist', 'albumartistname', 'mastermetadataalbumartistname', 'performer', 'band', 'containerartistname'];
const WHEN = ['ts', 'endtime', 'addedat', 'dateadded', 'addeddate', 'added', 'playedat', 'dateplayed', 'lastplayed', 'played', 'listenedat', 'scrobbledat', 'timestamp', 'eventstarttimestamp', 'date', 'time'];
const URI = ['spotifytrackuri', 'trackuri', 'spotifyuri', 'uri'];
const PLAYED_MS = ['msplayed', 'playdurationmilliseconds'];
const NOT_A_SONG = ['episodename', 'episodeshowname', 'podcastname', 'audiobooktitle', 'audiobookchaptertitle'];

/** A name, even when an export nests it: { name: 'Sade' }, Last.fm's { '#text': 'Sade' }, or a list of those. */
function textOf(value: unknown): string {
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    const v = value as { name?: unknown; '#text'?: unknown };
    return cleanField(v.name ?? v['#text']);
  }
  return cleanField(value);
}

const pick = (entry: Map<string, unknown>, names: string[]) => {
  for (const n of names) {
    const v = entry.get(n);
    if (v != null && v !== '') return v;
  }
  return undefined;
};

const idFrom = (uri: unknown, name: string, artist: string) =>
  (typeof uri === 'string' && /track[:/]([A-Za-z0-9]+)/.exec(uri)?.[1]) || `song:${artist.toLowerCase()}|${name.toLowerCase()}`;

type EntryResult = { song: SpotifyLike } | { skip: Omit<RowSkip, 'at'> } | 'short-play';

/** One row or item, with its keys already normalized. */
function readEntry(entry: Map<string, unknown>, now: number): EntryResult {
  const show = NOT_A_SONG.map((n) => textOf(entry.get(n))).find(Boolean);
  const name = textOf(pick(entry, TITLE));
  const artist = textOf(pick(entry, ARTIST));
  if (show && !name) return { skip: { reason: 'not-a-song', name: textOf(entry.get('episodename')) || show, artist: '' } };
  const skip = (reason: SkipReason) => ({ skip: { reason, name, artist } });
  if (!name && !artist) return skip('empty');
  if (!name) return skip('no-title');
  if (!artist) return skip('no-artist');
  const ms = pick(entry, PLAYED_MS);
  if (typeof ms === 'number' && ms < SHORT_PLAY_MS) return 'short-play';
  const when = pick(entry, WHEN);
  const addedAt = when === undefined ? now : parseWhen(when, now);
  if (addedAt == null) return skip('bad-date');
  return {
    song: {
      id: idFrom(pick(entry, URI), name, artist),
      name,
      artist,
      art: '',
      addedAt,
      from: '',
      source: 'file',
      ...(when === undefined ? { undated: true as const } : {}),
    },
  };
}

// ---------- One file ----------

type FileRead = { result: FileResult; songs: SpotifyLike[]; skips: RowSkip[]; shortPlays: number; notYours: number; unit: 'Row' | 'Item' };

const empty = (name: string, problem: string): FileRead => ({
  result: { name, found: 0, problem },
  songs: [],
  skips: [],
  shortPlays: 0,
  notYours: 0,
  unit: 'Row',
});

const list = (columns: string[]) => columns.map((c) => c.trim().slice(0, 30)).filter(Boolean).slice(0, 6).join(', ');

type RawEntry = { at: number; entry: Map<string, unknown> | null; broken?: SkipReason };

function readRows(name: string, kind: string, unit: FileRead['unit'], entries: RawEntry[], now: number, note?: string): FileRead {
  const out: FileRead = { result: { name, kind, found: 0, ...(note ? { note } : {}) }, songs: [], skips: [], shortPlays: 0, notYours: 0, unit };
  for (const { at, entry, broken } of entries) {
    if (!entry) {
      out.skips.push({ reason: 'not-an-entry', at, name: '', artist: '' });
      continue;
    }
    if (broken) {
      out.skips.push({ reason: broken, at, name: textOf(pick(entry, TITLE)), artist: textOf(pick(entry, ARTIST)) });
      continue;
    }
    const read = readEntry(entry, now);
    if (read === 'short-play') out.shortPlays++;
    else if ('song' in read) out.songs.push(read.song);
    else out.skips.push({ ...read.skip, at });
  }
  out.result.found = out.songs.length;
  return out;
}

function readCsvFile(name: string, text: string, now: number): FileRead {
  const firstLine = text.slice(0, text.search(/\r|\n|$/));
  const delimiter = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const [head, ...body] = parseCsv(text, delimiter);
  const columns = (head ?? []).map(norm);
  const hasTitle = TITLE.some((t) => columns.includes(t));
  const hasArtist = ARTIST.some((a) => columns.includes(a));
  if (!hasTitle || !hasArtist) {
    const has = `It has: ${list(head ?? [])}.`;
    if (hasTitle) return empty(name, `This has a song column but no artist column, so its songs can’t be matched. ${has}`);
    if (hasArtist) return empty(name, `This has an artist column but no song column. ${has}`);
    return empty(name, `No song or artist columns here. It has: ${list(head ?? [])}.`);
  }
  // An odd number of quote marks: one never closes, and the parser took the rest of the file as a single field.
  const unclosed = (text.match(/"/g)?.length ?? 0) % 2 === 1;
  if (unclosed) body.pop();
  const note = unclosed
    ? `A quote mark in this file never closes around row ${body.length + 2}, so that row and everything after it couldn’t be read.`
    : undefined;
  const rows = body
    .map((cells, i) => ({ cells, at: i + 2 }))
    // A truly blank line isn't a row. A row of empty cells is, since someone meant something by it.
    .filter(({ cells }) => cells.length > 1 || cells[0]?.trim())
    .map(({ cells, at }): RawEntry => ({
      at,
      entry: new Map<string, unknown>(columns.map((c, i) => [c, cells[i]?.trim() ?? ''])),
      // Cells past the last column mean a comma split something, so every column after it is wrong.
      broken: cells.slice(columns.length).some((c) => c.trim()) ? 'bad-columns' : undefined,
    }));
  if (!rows.length) return empty(name, note ?? 'This file has the right columns but no songs under them.');
  return readRows(name, 'A list of songs', 'Row', rows, now, note);
}

const entryMap = (item: unknown) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? new Map(Object.entries(item).map(([k, v]) => [norm(k), v] as [string, unknown]))
    : null;

/** Whether a list looks like songs (or a podcast history) from its first items. */
function looksLikeSongs(items: unknown[]): boolean {
  const keys = items.slice(0, 20).flatMap((i) => [...(entryMap(i)?.keys() ?? [])]);
  const has = (names: string[]) => names.some((n) => keys.includes(n));
  return (has(TITLE) && has(ARTIST)) || has(NOT_A_SONG);
}

function songListIn(json: unknown): unknown[] | null {
  if (Array.isArray(json)) return looksLikeSongs(json) ? json : null;
  if (json && typeof json === 'object')
    for (const value of Object.values(json)) if (Array.isArray(value) && value.length && looksLikeSongs(value)) return value;
  return null;
}

/** Parse JSON, or if it stops partway through a list, everything up to the last whole item. */
function parseJson(text: string): { json: unknown; cutOff: boolean } | null {
  try {
    return { json: JSON.parse(text), cutOff: false };
  } catch {
    const end = text.lastIndexOf('}');
    if (!text.startsWith('[') || end < 0) return null;
    try {
      return { json: JSON.parse(`${text.slice(0, end + 1)}]`), cutOff: true };
    } catch {
      return null;
    }
  }
}

function readJsonFile(name: string, text: string, now: number): FileRead {
  const parsed = parseJson(text);
  if (!parsed) return empty(name, 'This JSON is broken and can’t be read. Try exporting it again.');
  if (Array.isArray(parsed.json) && !parsed.json.length) return empty(name, 'This file has no songs in it.');
  const items = songListIn(parsed.json);
  if (!items) return empty(name, 'This JSON has no list of songs in it.');
  const keys = items.slice(0, 20).flatMap((i) => [...(entryMap(i)?.keys() ?? [])]);
  const history = keys.some((k) => PLAYED_MS.includes(k));
  const kind = history ? 'Spotify listening history' : Array.isArray(parsed.json) ? 'A list of songs' : 'A saved library';
  const note = parsed.cutOff ? 'This file was cut off partway. The songs before the cut came in.' : undefined;
  return readRows(name, kind, 'Item', items.map((item, i) => ({ at: i + 1, entry: entryMap(item) })), now, note);
}

function isBinary(text: string): boolean {
  const head = text.slice(0, 4096);
  if (head.includes('\u0000')) return true;
  return (head.match(/�/g)?.length ?? 0) > head.length * 0.05;
}

function readOneFile(name: string, raw: string, now: number): FileRead {
  const text = raw.replace(/^﻿/, '').trim();
  if (!text) return empty(name, 'This file is empty.');
  if (isBinary(text)) return empty(name, 'This isn’t a text file, so it can’t hold a song list. Pick a .csv, .json or .zip.');
  return text[0] === '[' || text[0] === '{' ? readJsonFile(name, text, now) : readCsvFile(name, text, now);
}

const FAILED_TEXT: Record<NonNullable<PickedFile['failed']>, string> = {
  unreadable: 'Couldn’t open this file. Try exporting it again.',
  'too-big': 'This file is too big to read on a phone (over 100 MB).',
  'empty-zip': 'This ZIP has no .csv or .json files in it.',
};

// ---------- All the files together ----------

const baseName = (name: string) => name.replace(/^.*\//, '');

function rowLabel(unit: FileRead['unit'], { at, name, artist }: RowSkip): string {
  const what = name && artist ? `“${name}” by ${artist}` : name ? `“${name}”` : artist ? `by ${artist}` : '';
  return what ? `${unit} ${at} · ${what}` : `${unit} ${at}`;
}

/** Read every picked file. One bad file never stops the others. */
export function readImport(files: PickedFile[], now: number): ImportReport {
  const exports = files.filter((f) => f.text != null && isExportify(f.text));
  // Read together, since "you" in a playlist file is decided across all of them.
  const exportReads = readExportify(exports.map((f) => ({ name: f.name, text: f.text! })));
  const exportOf = new Map(exports.map((f, i) => [f, exportReads[i]]));
  const reads = files.map((f): FileRead & { fromZip?: boolean } => {
    const name = baseName(f.name);
    if (f.failed || f.text == null) return empty(name, FAILED_TEXT[f.failed ?? 'unreadable']);
    const e = exportOf.get(f);
    if (!e) return { ...readOneFile(name, f.text, now), fromZip: f.fromZip };
    if (!e.rows) return empty(name, 'This file has the right columns but no songs under them.');
    return {
      result: { name, kind: 'Exportify export', found: e.songs.length },
      songs: e.songs,
      skips: e.skips,
      shortPlays: 0,
      notYours: e.notYours,
      unit: 'Row',
    };
  });

  const all = reads.flatMap((r) => r.songs);
  const songs = mergeSaves(all);
  const groups = new Map<SkipReason, SkipGroup>();
  for (const r of reads)
    for (const skip of r.skips) {
      const g = groups.get(skip.reason) ?? { reason: skip.reason, text: SKIP_TEXT[skip.reason], count: 0, rows: [] };
      g.count++;
      if (g.rows.length < ROWS_KEPT) g.rows.push(rowLabel(r.unit, skip));
      groups.set(skip.reason, g);
    }
  const skipped = [...groups.values()].sort((a, b) => b.count - a.count);
  const worked = reads.some((r) => r.songs.length || r.skips.length);
  return {
    songs,
    skipped,
    skippedCount: skipped.reduce((sum, g) => sum + g.count, 0),
    leftOut: {
      shortPlays: reads.reduce((sum, r) => sum + r.shortPlays, 0),
      notYours: reads.reduce((sum, r) => sum + r.notYours, 0),
      repeats: all.length - songs.length,
    },
    files: reads.filter((r) => !(worked && r.fromZip && r.result.problem)).map((r) => r.result),
  };
}

/** A new import joins what you already had, so a second source never wipes out the first. */
export function mergeIntoLibrary(existing: SpotifyLike[], incoming: SpotifyLike[]): { likes: SpotifyLike[]; newCount: number } {
  const likes = mergeSaves([...existing, ...incoming]);
  return { likes, newCount: likes.length - mergeSaves(existing).length };
}

// ---------- What the sheet says ----------

const n = (count: number) => count.toLocaleString('en-US');
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

export function importHeadline(r: ImportReport): string {
  if (r.saveFailed) return 'Nothing was saved. What you had before is still here.';
  if (!r.songs.length)
    return r.skippedCount ? `Nothing came in. ${plural(r.skippedCount, 'row', 'rows')} couldn’t be used.` : 'Nothing came in.';
  const inn = `${plural(r.songs.length, 'song', 'songs')} came in.`;
  return r.skippedCount ? `${inn} ${n(r.skippedCount)} didn’t.` : inn;
}

export function leftOutLine(r: ImportReport): string | null {
  const parts = [
    r.leftOut.shortPlays ? plural(r.leftOut.shortPlays, 'play under 30 seconds', 'plays under 30 seconds') : '',
    r.leftOut.notYours ? plural(r.leftOut.notYours, 'song someone else added', 'songs someone else added') : '',
    r.leftOut.repeats ? plural(r.leftOut.repeats, 'repeat', 'repeats') : '',
  ].filter(Boolean);
  return parts.length ? `Left out on purpose: ${parts.join(', ')}.` : null;
}
