// Picks each day's 5 Daily Drop songs offline and verifies every one (fresh
// Last.fm count, rank window, iTunes US preview, not explicit) so nothing
// can fail live. See docs/superpowers/specs/2026-09-29-daily-drop-design.md.
import fs from 'node:fs';
import path from 'node:path';

import type { DropSong, Slot } from '../lib/daily-drop.ts';
import { todayKey } from '../lib/daily-drop.ts';
import { fetchArtistListeners, fetchItunesCatalog, fetchTopTracks, intersectByTitle } from '../lib/pool.ts';
import { addDays, canRedo, daysBetween, inRankWindow, slotFor, SLOTS } from './drop-rules.ts';

const LAST_DAY = '2026-12-31';
const MAX_TRIES_PER_SLOT = 40;
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

/** One verified song for `slot`, or null. Mutates `usedArtists`. */
async function pickSong(slot: Slot, artists: Artist[], usedArtists: Set<string>, usedGenres: Set<string>): Promise<DropSong | null> {
  const pool = shuffled(artists.filter((a) => slotFor(a.seedListeners) === slot && !usedArtists.has(a.name) && !usedGenres.has(a.genre)));
  for (const a of pool.slice(0, MAX_TRIES_PER_SLOT)) {
    usedArtists.add(a.name); // tried once, never retried
    const listeners = await fetchArtistListeners(a.name);
    if (listeners == null || slotFor(listeners) !== slot) continue;
    const ranked = (await fetchTopTracks(a.name).catch(() => [])).filter((t) => inRankWindow(slot, t.rank));
    if (ranked.length === 0) continue;
    const catalog = (await fetchItunesCatalog(a.itunesArtistId).catch(() => [])).filter((e) => !e.explicit);
    const playable = intersectByTitle(ranked, catalog).filter((c) => c.previewUrl);
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

function usedArtistsIn(file: DropsFile): Set<string> {
  const used = new Set<string>();
  for (const d of Object.values(file.days)) {
    for (const s of [...d.songs, ...Object.values(d.candidates ?? {}).flat()]) used.add(s.artist);
  }
  return used;
}

async function main() {
  const file = load();
  const artists = loadArtists();
  const used = usedArtistsIn(file);
  const numberFor = (day: string) => daysBetween(file.firstDay, day) + 1;

  const choose = flag('--choose');
  if (choose) {
    const entry = file.days[choose];
    if (!entry?.candidates) throw new Error(`${choose} has no showcase candidates`);
    for (const pick of args.filter((a) => a.includes('='))) {
      const [slot, n] = pick.split('=') as [Slot, string];
      const s = entry.candidates[slot]?.[Number(n) - 1];
      if (!s) throw new Error(`No candidate ${pick}`);
      entry.songs = entry.songs.filter((x) => x.slot !== slot).concat(s);
    }
    entry.songs = shuffled(entry.songs);
    save(file);
    console.log(`${choose}: ${entry.songs.length}/5 chosen`);
    return;
  }

  const showcase = flag('--showcase');
  if (showcase) {
    if (!canRedo(showcase, today)) throw new Error('Showcase day must be in the future');
    const candidates = await pickSongs(3, artists, used);
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
    const picked = await pickSongs(1, artists, used, keep);
    file.days[redo] = { number: numberFor(redo), songs: shuffled([...keep, ...Object.values(picked).flat()]) };
    save(file);
    console.log(`Redid ${redo}${slot ? ` (${slot})` : ''}`);
    return;
  }

  const dryRun = args.includes('--dry-run');
  for (let day = today; day <= LAST_DAY; day = addDays(day, 1)) {
    if (file.days[day]) continue;
    console.log(`${day}:`);
    const songs = shuffled(Object.values(await pickSongs(1, artists, used)).flat());
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
