// Picks each day's 5 Daily Drop songs offline and verifies every one (fresh
// Last.fm count, rank window, iTunes US preview, not explicit) so nothing
// can fail live. See docs/superpowers/specs/2026-09-29-daily-drop-design.md.
import fs from 'node:fs';
import path from 'node:path';

import type { DropSong, Slot } from '../lib/daily-drop.ts';
import { todayKey } from '../lib/daily-drop.ts';
import { fetchArtistListeners, fetchItunesCatalog, fetchTopTracks, intersectByTitle } from '../lib/pool.ts';
import { addDays, canRedo, daysBetween, distinctGenres, inRankWindow, seedWindow, slotFor, SLOTS } from './drop-rules.ts';

const LAST_DAY = '2026-12-31';
const MAX_TRIES_PER_SLOT = 40;
// The seed data has only ~58 artists in the 'known' range (100K–1M), too few
// for ~94 distinct days, so a 'known' artist may return after this many days
// with a different song. Every other slot never repeats an artist.
const KNOWN_REUSE_AFTER_DAYS = 30;
const FILE = path.resolve(import.meta.dirname, '../drops/drops.json');
const RAW = path.resolve(import.meta.dirname, '../assets/genres-raw.json');

type DayEntry = { number: number; songs: DropSong[]; candidates?: Partial<Record<Slot, DropSong[]>> };
type DropsFile = { firstDay: string; days: Record<string, DayEntry> };
type Artist = { name: string; seedListeners: number; itunesArtistId: number; genre: string };

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : (args[i + 1] ?? '');
};
const today = todayKey(new Date());

function load(): DropsFile {
  if (!fs.existsSync(FILE)) return { firstDay: today, days: {} };
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}
function save(file: DropsFile) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(file, null, 2));
}

function loadArtists(): Artist[] {
  const raw = JSON.parse(fs.readFileSync(RAW, 'utf8')) as Record<string, { name: string; listeners: number; itunesArtistId?: number | null }[]>;
  const seen = new Set<string>();
  const out: Artist[] = [];
  for (const [genre, list] of Object.entries(raw)) {
    for (const a of list) {
      if (!a.itunesArtistId || seen.has(a.name)) continue;
      seen.add(a.name);
      out.push({ name: a.name, seedListeners: a.listeners, itunesArtistId: a.itunesArtistId, genre });
    }
  }
  return out;
}

function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Fresh Last.fm counts seen this run. An artist whose fresh count lands in a
// different slot stays available for that slot instead of being used up.
const freshListeners = new Map<string, number | null>();

function mightFit(a: Artist, slot: Slot): boolean {
  const fresh = freshListeners.get(a.name);
  if (fresh !== undefined) return fresh != null && slotFor(fresh) === slot;
  const w = seedWindow(slot);
  return a.seedListeners >= w.min && a.seedListeners < w.max;
}

/** One verified song for `slot`, or null. Mutates `usedArtists` and `usedTracks`. */
async function pickSong(slot: Slot, artists: Artist[], usedArtists: Set<string>, usedGenres: Set<string>): Promise<DropSong | null> {
  const open = artists.filter((a) => mightFit(a, slot) && !usedArtists.has(a.name) && !usedGenres.has(a.genre));
  // Seeds already inside the slot's real range first; drifted neighbours after.
  const inRange = (a: Artist) => slotFor(freshListeners.get(a.name) ?? a.seedListeners) === slot;
  const pool = [...shuffled(open.filter(inRange)), ...shuffled(open.filter((a) => !inRange(a)))];
  let tries = 0;
  for (const a of pool) {
    if (tries >= MAX_TRIES_PER_SLOT) break;
    if (!freshListeners.has(a.name)) freshListeners.set(a.name, await fetchArtistListeners(a.name));
    const listeners = freshListeners.get(a.name);
    if (listeners == null || slotFor(listeners) !== slot) continue; // cheap mismatch: not a try
    tries++;
    usedArtists.add(a.name); // right slot: tried once, never retried
    const ranked = (await fetchTopTracks(a.name).catch(() => [])).filter((t) => inRankWindow(slot, t.rank));
    if (ranked.length === 0) continue;
    const catalog = (await fetchItunesCatalog(a.itunesArtistId).catch(() => [])).filter((e) => !e.explicit);
    const playable = intersectByTitle(ranked, catalog).filter((c) => c.previewUrl && !usedTracks.has(c.itunesTrackId));
    if (playable.length === 0) continue;
    const c = shuffled(playable)[0];
    console.log(`  ${slot.padEnd(6)} ${a.name} — ${c.title} (${listeners.toLocaleString()} listeners, ${a.genre})`);
    return {
      slot,
      itunesTrackId: c.itunesTrackId,
      itunesArtistId: a.itunesArtistId,
      title: c.title,
      artist: a.name,
      artworkUrl: c.artworkUrl ?? '',
      previewUrl: c.previewUrl!,
      genre: a.genre,
      listeners,
    };
  }
  return null;
}

async function pickSongs(perSlot: number, artists: Artist[], usedArtists: Set<string>, keep: DropSong[] = []): Promise<Partial<Record<Slot, DropSong[]>>> {
  const usedGenres = new Set(keep.map((s) => s.genre));
  const out: Partial<Record<Slot, DropSong[]>> = {};
  for (const slot of SLOTS) {
    if (keep.some((s) => s.slot === slot)) continue;
    const picks: DropSong[] = [];
    for (let i = 0; i < perSlot; i++) {
      const s = await pickSong(slot, artists, usedArtists, usedGenres);
      if (!s) throw new Error(`Ran out of ${slot} artists — widen MAX_TRIES_PER_SLOT or the date range`);
      picks.push(s);
      if (perSlot === 1) usedGenres.add(s.genre);
    }
    out[slot] = picks;
  }
  return out;
}

const usedTracks = new Set<number>();

/** Artists unavailable for `day`: everyone already used, except 'known' artists last used over KNOWN_REUSE_AFTER_DAYS ago. */
function usedArtistsFor(file: DropsFile, day: string): Set<string> {
  const used = new Set<string>();
  for (const [d, entry] of Object.entries(file.days)) {
    for (const s of [...entry.songs, ...Object.values(entry.candidates ?? {}).flat()]) {
      usedTracks.add(s.itunesTrackId);
      if (s.slot === 'known' && Math.abs(daysBetween(d, day)) > KNOWN_REUSE_AFTER_DAYS) continue;
      used.add(s.artist);
    }
  }
  return used;
}

async function main() {
  const file = load();
  const artists = loadArtists();
  const numberFor = (day: string) => daysBetween(file.firstDay, day) + 1;

  const choose = flag('--choose');
  if (choose) {
    const entry = file.days[choose];
    if (!entry?.candidates) throw new Error(`${choose} has no showcase candidates`);
    if (!canRedo(choose, today)) throw new Error(`Can't change ${choose}: people may have played it`);
    for (const pick of args.filter((a) => a.includes('='))) {
      const [slot, n] = pick.split('=') as [Slot, string];
      const s = entry.candidates[slot]?.[Number(n) - 1];
      if (!s) throw new Error(`No candidate ${pick}`);
      entry.songs = entry.songs.filter((x) => x.slot !== slot).concat(s);
    }
    if (!distinctGenres(entry.songs)) throw new Error('Two picks share a genre — choose a different candidate');
    if (entry.songs.length === 5) entry.songs = shuffled(entry.songs); // order is fixed once complete
    save(file);
    console.log(`${choose}: ${entry.songs.length}/5 chosen`);
    return;
  }

  const showcase = flag('--showcase');
  if (showcase) {
    if (!canRedo(showcase, today)) throw new Error('Showcase day must be in the future');
    const candidates = await pickSongs(3, artists, usedArtistsFor(file, showcase));
    file.days[showcase] = { number: numberFor(showcase), songs: [], candidates };
    save(file);
    console.log(`Saved 3 candidates per slot for ${showcase}. Run npm run review-drops, then --choose.`);
    return;
  }

  const redo = flag('--redo');
  if (redo) {
    if (!canRedo(redo, today)) throw new Error(`Can't redo ${redo}: people may have played it`);
    const slot = flag('--slot') as Slot | undefined;
    const keep = slot ? (file.days[redo]?.songs ?? []).filter((s) => s.slot !== slot) : [];
    const picked = await pickSongs(1, artists, usedArtistsFor(file, redo), keep);
    file.days[redo] = { number: numberFor(redo), songs: shuffled([...keep, ...Object.values(picked).flat()]) };
    save(file);
    console.log(`Redid ${redo}${slot ? ` (${slot})` : ''}`);
    return;
  }

  const dryRun = args.includes('--dry-run');
  for (let day = today; day <= LAST_DAY; day = addDays(day, 1)) {
    if (file.days[day]) continue;
    console.log(`${day}:`);
    const songs = shuffled(Object.values(await pickSongs(1, artists, usedArtistsFor(file, day))).flat());
    if (dryRun) {
      console.log('Dry run — nothing written.');
      return;
    }
    file.days[day] = { number: numberFor(day), songs };
    save(file); // after every day, so a stop loses at most one
  }
  console.log('All days through', LAST_DAY, 'are picked.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
