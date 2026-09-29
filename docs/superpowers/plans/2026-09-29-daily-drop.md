# Daily Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every day, everyone plays the same 5 blind songs first thing on Home. The results screen then reveals all 5 together with the crowd's votes.

**Architecture:**
- An offline Node script (`scripts/make-drops.ts`) picks and verifies each day's 5 songs into `drops/drops.json`, and a second script uploads them to Supabase.
- The app reads today's drop and posts votes over Supabase's REST API with plain `fetch`, with no new dependency.
- Drop state lives in one hook (`hooks/use-daily-drop.ts`), so `app/(tabs)/index.tsx` only branches on it.

**Tech Stack:** Expo Router 6 / React Native, TypeScript, Node's built-in test runner (`node --experimental-strip-types --test`), Supabase (Postgres + PostgREST), iTunes lookup API, Last.fm API.

**Spec:** `docs/superpowers/specs/2026-09-29-daily-drop-design.md`

## Global Constraints

- No new npm dependencies.
- `SUPABASE_SERVICE_KEY` is read only by scripts, never through an `EXPO_PUBLIC_` variable. The app uses `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- iTunes calls are serialized with ≥ 3s between them. Reuse `lib/pool.ts`'s paced `fetchItunesCatalog`, whose delay is `itunesDelayMs = 3_000`. Last.fm calls go through the paced `fetchTopTracks` / `fetchArtistListeners`.
- Slots by fresh Last.fm listeners: `buried` < 5,000; `tiny` 5,000–19,999; `radar` 20,000–99,999; `known` 100,000–999,999; `famous` ≥ 1,000,000.
- Track rank window: `famous` = Last.fm rank 11–50. Every other slot = rank 1–3.
- 5 different genres per drop. No artist repeats across the whole file. Explicit tracks are excluded.
- Drops are generated through `2026-12-31`. A day key is the device's **local** date, formatted `YYYY-MM-DD`.
- Crowd label: `"<likes> of <voters> liked"` while voters < 20, `"<pct>% liked"` at 20 or more.
- Headline: a lonely pick (you liked it, crowd like-share ≤ 25%, voters ≥ 5, the lowest share wins), else the famous-slot line.
- Past days (including today) can never be redone.
- Tests run with: `node --experimental-strip-types --test <files>`.

## Review Focus

1. **Killing the app mid-drop:** reopening resumes at the next unplayed song with the earlier votes kept. Pinned in Task 1 (`nextDropIndex`) and used by Task 5.
2. **Midnight passing mid-drop:** a drop started at 23:58 keeps its original day for its votes and results. The hook stores the day with the progress and never recomputes it mid-drop (Task 5). The `todayKey` local-date test is in Task 1.
3. **Liking a drop song already liked in the feed:** the Liked list must not show it twice. `appendLikedTrack` dedupes by track id (Task 4).
4. **Undo after the 5th drop swipe:** it must not reopen a drop whose votes were already sent. Drop undo only exists while fewer than 5 votes are in (Task 5), and the feed undo snapshot is cleared when the drop ends.
5. **Resending votes after a failure:** it must not double-count. The database primary key rejects duplicates, and the client treats HTTP 409 as "already sent" (Task 4). A drop abandoned 2 or more days ago is never resumed, and its votes are never retried forever (Tasks 4 and 5).

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/daily-drop.ts` (create) | Pure drop types and logic: `todayKey`, `crowdLabel`, `pickHeadline`, `shareText`, `dropToDiscoveryTracks`, `nextDropIndex` |
| `lib/daily-drop.test.ts` (create) | Tests for the above |
| `scripts/drop-rules.ts` (create) | Pure script rules: `SLOTS`, `slotFor`, `inRankWindow`, date helpers, `canRedo` |
| `scripts/drop-rules.test.ts` (create) | Tests for the above |
| `lib/pool.ts` (modify) | Add `explicit` to `ItunesEntry` |
| `scripts/make-drops.ts` (create) | Generate / `--dry-run` / `--redo` / `--showcase` / `--choose` |
| `scripts/review-drops.ts` (create) | Write `drops/review.html` |
| `scripts/upload-drops.ts` (create) | Upsert complete days to Supabase |
| `supabase/setup.sql` (create) | Tables, view, RLS |
| `lib/supabase.ts` (create) | `fetchDrop`, `sendVotes`, `fetchResults` |
| `lib/discovery-storage.ts` (modify) | `deviceId`, drop cache, drop progress, pending votes, liked dedupe |
| `hooks/use-daily-drop.ts` (create) | Drop state machine for Home |
| `components/discovery/swipe-card.tsx`, `card-stack.tsx` (modify) | `allowDown` prop |
| `app/(tabs)/index.tsx` (modify) | Play the drop before the feed |
| `app/drop-results.tsx` (create) | Results screen |
| `app/_layout.tsx` (modify) | Register the route |
| `app/(tabs)/explore.tsx` (modify) | "Today's drop" line |

---

### Task 1: Pure drop logic

**Files:**
- Create: `lib/daily-drop.ts`
- Test: `lib/daily-drop.test.ts`

**Interfaces:**
- Produces:
  - `type Slot = 'buried' | 'tiny' | 'radar' | 'known' | 'famous'`
  - `type DropSong = { slot: Slot; itunesTrackId: number; itunesArtistId: number; title: string; artist: string; artworkUrl: string; previewUrl: string; genre: string; listeners: number }`
  - `type Drop = { day: string; number: number; songs: DropSong[] }`
  - `type DropVote = { position: number; liked: boolean }`
  - `type SongResult = { position: number; voters: number; likes: number }`
  - `todayKey(d: Date): string`
  - `nextDropIndex(votes: DropVote[]): number`
  - `crowdLabel(r: SongResult | undefined): string`
  - `pickHeadline(drop: Drop, votes: DropVote[], results: SongResult[]): string`
  - `shareText(drop: Drop, votes: DropVote[]): string`
  - `dropToDiscoveryTracks(drop: Drop): DiscoveryTrack[]`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/daily-drop.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  crowdLabel,
  dropToDiscoveryTracks,
  nextDropIndex,
  pickHeadline,
  shareText,
  todayKey,
  type Drop,
  type DropSong,
} from './daily-drop.ts';

const song = (slot: DropSong['slot'], artist: string, listeners: number, id: number): DropSong => ({
  slot, artist, listeners, itunesTrackId: id, itunesArtistId: id + 1000, title: `Song ${id}`,
  artworkUrl: 'https://x/100x100bb.jpg', previewUrl: `https://p/${id}.m4a`, genre: 'Jazz',
});
const drop: Drop = {
  day: '2026-10-01',
  number: 3,
  songs: [song('radar', 'R', 40_000, 1), song('famous', 'F', 3_200_000, 2), song('buried', 'B', 900, 3), song('known', 'K', 300_000, 4), song('tiny', 'T', 8_000, 5)],
};

test('todayKey uses the local calendar date', () => {
  assert.equal(todayKey(new Date(2026, 9, 1, 23, 59)), '2026-10-01');
  assert.equal(todayKey(new Date(2026, 0, 5, 0, 1)), '2026-01-05');
});

test('nextDropIndex resumes after the last vote', () => {
  assert.equal(nextDropIndex([]), 0);
  assert.equal(nextDropIndex([{ position: 0, liked: true }, { position: 1, liked: false }]), 2);
});

test('crowdLabel shows counts under 20 voters and percent from 20', () => {
  assert.equal(crowdLabel(undefined), 'No votes yet');
  assert.equal(crowdLabel({ position: 0, voters: 6, likes: 4 }), '4 of 6 liked');
  assert.equal(crowdLabel({ position: 0, voters: 19, likes: 19 }), '19 of 19 liked');
  assert.equal(crowdLabel({ position: 0, voters: 20, likes: 13 }), '65% liked');
});

test('pickHeadline prefers a lonely like (lowest share wins)', () => {
  const votes = [0, 1, 2, 3, 4].map((position) => ({ position, liked: position !== 1 }));
  const results = [
    { position: 0, voters: 10, likes: 2 },
    { position: 1, voters: 10, likes: 6 },
    { position: 2, voters: 10, likes: 1 },
    { position: 3, voters: 10, likes: 9 },
    { position: 4, voters: 10, likes: 5 },
  ];
  assert.equal(pickHeadline(drop, votes, results), "You're one of only 10% who liked B.");
});

test('pickHeadline falls back to the famous slot, with and without enough voters', () => {
  const skippedFamous = [0, 1, 2, 3, 4].map((position) => ({ position, liked: position === 3 }));
  const results = [{ position: 1, voters: 8, likes: 3 }];
  assert.equal(pickHeadline(drop, skippedFamous, results), 'You skipped a song with 3.2M listeners — so did 63% of people.');
  assert.equal(pickHeadline(drop, skippedFamous, [{ position: 1, voters: 3, likes: 1 }]), 'You skipped a song with 3.2M listeners.');
  const likedFamous = [0, 1, 2, 3, 4].map((position) => ({ position, liked: position === 1 }));
  assert.equal(pickHeadline(drop, likedFamous, []), 'You spotted it — 3.2M listeners.');
});

test('shareText has no artist names and counts buried likes', () => {
  const votes = [true, false, true, true, false].map((liked, position) => ({ position, liked }));
  assert.equal(shareText(drop, votes), 'Blindspot Daily #3\n💜🖤💜💜🖤\nLiked 3 blind · 1 under 5K listeners');
  const none = [false, false, false, true, false].map((liked, position) => ({ position, liked }));
  assert.equal(shareText(drop, none), 'Blindspot Daily #3\n🖤🖤🖤💜🖤\nLiked 1 blind');
});

test('dropToDiscoveryTracks keeps drop order and found-at listeners', () => {
  const tracks = dropToDiscoveryTracks(drop);
  assert.deepEqual(tracks.map((t) => t.id), [1, 2, 3, 4, 5]);
  assert.equal(tracks[2].artistListeners, 900);
  assert.equal(tracks[0].artistId, 1001);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test lib/daily-drop.test.ts`
Expected: FAIL. `Cannot find module './daily-drop.ts'`.

- [ ] **Step 3: Implement**

```ts
// lib/daily-drop.ts
import { describeListeners, type DiscoveryTrack } from './discovery.ts';

export type Slot = 'buried' | 'tiny' | 'radar' | 'known' | 'famous';
export type DropSong = {
  slot: Slot;
  itunesTrackId: number;
  itunesArtistId: number;
  title: string;
  artist: string;
  artworkUrl: string;
  previewUrl: string;
  genre: string;
  listeners: number;
};
export type Drop = { day: string; number: number; songs: DropSong[] };
export type DropVote = { position: number; liked: boolean };
export type SongResult = { position: number; voters: number; likes: number };

const CROWD_PERCENT_FROM = 20;
const LONELY_MAX_SHARE = 0.25;
const LONELY_MIN_VOTERS = 5;

export function todayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nextDropIndex(votes: DropVote[]): number {
  return votes.length;
}

export function crowdLabel(r: SongResult | undefined): string {
  if (!r || r.voters === 0) return 'No votes yet';
  if (r.voters < CROWD_PERCENT_FROM) return `${r.likes} of ${r.voters} liked`;
  return `${Math.round((r.likes / r.voters) * 100)}% liked`;
}

export function pickHeadline(drop: Drop, votes: DropVote[], results: SongResult[]): string {
  const resultAt = (p: number) => results.find((r) => r.position === p);
  const lonely = votes
    .filter((v) => v.liked)
    .map((v) => ({ v, r: resultAt(v.position) }))
    .filter(({ r }) => r && r.voters >= LONELY_MIN_VOTERS && r.likes / r.voters <= LONELY_MAX_SHARE)
    .sort((a, b) => a.r!.likes / a.r!.voters - b.r!.likes / b.r!.voters)[0];
  if (lonely) {
    const pct = Math.round((lonely.r!.likes / lonely.r!.voters) * 100);
    return `You're one of only ${pct}% who liked ${drop.songs[lonely.v.position].artist}.`;
  }

  const famousAt = drop.songs.findIndex((s) => s.slot === 'famous');
  const count = describeListeners(drop.songs[famousAt].listeners).count;
  if (votes.find((v) => v.position === famousAt)?.liked) return `You spotted it — ${count} listeners.`;
  const r = resultAt(famousAt);
  if (!r || r.voters < LONELY_MIN_VOTERS) return `You skipped a song with ${count} listeners.`;
  const skipped = Math.round(((r.voters - r.likes) / r.voters) * 100);
  return `You skipped a song with ${count} listeners — so did ${skipped}% of people.`;
}

export function shareText(drop: Drop, votes: DropVote[]): string {
  const ordered = [...votes].sort((a, b) => a.position - b.position);
  const grid = ordered.map((v) => (v.liked ? '💜' : '🖤')).join('');
  const liked = ordered.filter((v) => v.liked);
  const buried = liked.filter((v) => drop.songs[v.position].listeners < 5_000).length;
  const tail = buried > 0 ? ` · ${buried} under 5K listeners` : '';
  return `Blindspot Daily #${drop.number}\n${grid}\nLiked ${liked.length} blind${tail}`;
}

export function dropToDiscoveryTracks(drop: Drop): DiscoveryTrack[] {
  return drop.songs.map((s) => ({
    id: s.itunesTrackId,
    trackName: s.title,
    artistId: s.itunesArtistId,
    artistName: s.artist,
    artworkUrl100: s.artworkUrl,
    primaryGenreName: s.genre,
    previewUrl: s.previewUrl,
    trackViewUrl: '',
    collectionName: null,
    artistListeners: s.listeners,
  }));
}
```

Note: the headline test expects `63%`. That is 5 skipped out of 8 voters = 62.5%, which rounds to 63.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --experimental-strip-types --test lib/daily-drop.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/daily-drop.ts lib/daily-drop.test.ts
git commit -m "Add Daily Drop pure logic: day keys, crowd labels, headline, share text"
```

---

### Task 2: Script rules and the explicit flag

**Files:**
- Create: `scripts/drop-rules.ts`
- Test: `scripts/drop-rules.test.ts`
- Modify: `lib/pool.ts` (`ItunesLookupTrack`, `ItunesEntry`, `fetchItunesCatalog`)

**Interfaces:**
- Consumes: `Slot` from `lib/daily-drop.ts`
- Produces:
  - `SLOTS: Slot[]`, in pick order `['famous', 'buried', 'tiny', 'known', 'radar']`, scarcest first
  - `slotFor(listeners: number): Slot`
  - `inRankWindow(slot: Slot, rank: number): boolean`
  - `addDays(day: string, n: number): string`
  - `daysBetween(a: string, b: string): number`
  - `canRedo(day: string, today: string): boolean`
  - `ItunesEntry.explicit: boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// scripts/drop-rules.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, canRedo, daysBetween, inRankWindow, slotFor } from './drop-rules.ts';

test('slotFor uses the spec thresholds', () => {
  assert.equal(slotFor(4_999), 'buried');
  assert.equal(slotFor(5_000), 'tiny');
  assert.equal(slotFor(19_999), 'tiny');
  assert.equal(slotFor(20_000), 'radar');
  assert.equal(slotFor(100_000), 'known');
  assert.equal(slotFor(999_999), 'known');
  assert.equal(slotFor(1_000_000), 'famous');
});

test('inRankWindow: famous takes ranks 11-50, others 1-3', () => {
  assert.equal(inRankWindow('famous', 10), false);
  assert.equal(inRankWindow('famous', 11), true);
  assert.equal(inRankWindow('famous', 50), true);
  assert.equal(inRankWindow('famous', 51), false);
  assert.equal(inRankWindow('tiny', 3), true);
  assert.equal(inRankWindow('tiny', 4), false);
});

test('date helpers cross month and year ends', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-09-29', '2026-10-02'), 3);
});

test('canRedo refuses today and the past', () => {
  assert.equal(canRedo('2026-10-01', '2026-10-01'), false);
  assert.equal(canRedo('2026-09-30', '2026-10-01'), false);
  assert.equal(canRedo('2026-10-02', '2026-10-01'), true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test scripts/drop-rules.test.ts`
Expected: FAIL. Module not found.

- [ ] **Step 3: Implement**

```ts
// scripts/drop-rules.ts
import type { Slot } from '../lib/daily-drop.ts';

export const SLOTS: Slot[] = ['famous', 'buried', 'tiny', 'known', 'radar'];

export function slotFor(listeners: number): Slot {
  if (listeners < 5_000) return 'buried';
  if (listeners < 20_000) return 'tiny';
  if (listeners < 100_000) return 'radar';
  if (listeners < 1_000_000) return 'known';
  return 'famous';
}

export function inRankWindow(slot: Slot, rank: number): boolean {
  return slot === 'famous' ? rank >= 11 && rank <= 50 : rank >= 1 && rank <= 3;
}

const toUtc = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));

export function addDays(day: string, n: number): string {
  return new Date(toUtc(day) + n * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function canRedo(day: string, today: string): boolean {
  return day > today;
}
```

In `lib/pool.ts`:
- Add `trackExplicitness?: string;` to `ItunesLookupTrack`.
- Add `explicit: boolean;` to `ItunesEntry`.
- In `fetchItunesCatalog`'s `.map`, add `explicit: r.trackExplicitness === 'explicit',`.

- [ ] **Step 4: Run the tests and the typecheck**

Run: `node --experimental-strip-types --test scripts/drop-rules.test.ts && npx tsc --noEmit`
Expected: PASS, 4 tests. tsc reports no errors. `ItunesEntry` is also built in `scripts/precompute-catalogs.ts`, so fix any object literal tsc flags there by adding `explicit: false`.

- [ ] **Step 5: Commit**

```bash
git add scripts/drop-rules.ts scripts/drop-rules.test.ts lib/pool.ts
git commit -m "Add Daily Drop slot/date rules and iTunes explicit flag"
```

---

### Task 3: Drop generator, review page, uploader, SQL

**Files:**
- Create: `scripts/make-drops.ts`, `scripts/review-drops.ts`, `scripts/upload-drops.ts`, `supabase/setup.sql`
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Consumes:
  - `slotFor`, `inRankWindow`, `SLOTS`, `addDays`, `daysBetween`, `canRedo` (Task 2)
  - `fetchArtistListeners`, `fetchTopTracks`, `fetchItunesCatalog`, `intersectByTitle` from `lib/pool.ts`
  - `todayKey`, `DropSong`, `Slot` (Task 1)
- Produces: `drops/drops.json`, shaped as `DropsFile = { firstDay: string; days: Record<string, { number: number; songs: DropSong[]; candidates?: Partial<Record<Slot, DropSong[]>> }> }`. A day is complete when `songs.length === 5`.

- [ ] **Step 1: Write `supabase/setup.sql`**

Copy the SQL block in spec section 4 exactly, with no changes.

- [ ] **Step 2: Write `scripts/make-drops.ts`**

```ts
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
```

- [ ] **Step 3: Write `scripts/review-drops.ts`**

```ts
// Writes drops/review.html: upcoming drops with players and swap commands.
import fs from 'node:fs';
import path from 'node:path';

import type { DropSong } from '../lib/daily-drop.ts';
import { todayKey } from '../lib/daily-drop.ts';

const DIR = path.resolve(import.meta.dirname, '../drops');
const file = JSON.parse(fs.readFileSync(path.join(DIR, 'drops.json'), 'utf8')) as {
  days: Record<string, { number: number; songs: DropSong[]; candidates?: Record<string, DropSong[]> }>;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const row = (s: DropSong, cmd: string) =>
  `<tr><td>${s.slot}</td><td>${esc(s.artist)} — ${esc(s.title)}<br><small>${s.listeners.toLocaleString()} listeners · ${esc(s.genre)}</small></td>` +
  `<td><audio controls preload="none" src="${s.previewUrl}"></audio></td><td><code>${cmd}</code></td></tr>`;

const today = todayKey(new Date());
const sections = Object.entries(file.days)
  .filter(([day]) => day >= today)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([day, d]) => {
    const songs = d.songs.map((s) => row(s, `npm run make-drops -- --redo ${day} --slot ${s.slot}`)).join('');
    const cands = Object.entries(d.candidates ?? {})
      .flatMap(([slot, list]) => list.map((s, i) => row(s, `${slot}=${i + 1}`)))
      .join('');
    return `<h2>#${d.number} · ${day}</h2><table>${songs}${cands ? `<tr><th colspan=4>Candidates — npm run make-drops -- --choose ${day} slot=n …</th></tr>${cands}` : ''}</table>`;
  })
  .join('');

fs.writeFileSync(
  path.join(DIR, 'review.html'),
  `<!doctype html><meta charset=utf-8><title>Drop review</title><style>body{font:14px system-ui;background:#111;color:#eee;padding:16px}td{padding:6px;border-bottom:1px solid #333}code{color:#b9a2ff}</style>${sections}`
);
console.log('Wrote drops/review.html');
```

- [ ] **Step 4: Write `scripts/upload-drops.ts`**

```ts
// Upserts every complete day in drops/drops.json to Supabase's drops table.
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.local');

const file = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../drops/drops.json'), 'utf8')) as {
  days: Record<string, { number: number; songs: unknown[] }>;
};
const rows = Object.entries(file.days)
  .filter(([, d]) => d.songs.length === 5)
  .map(([day, d]) => ({ day, number: d.number, songs: d.songs }));

const res = await fetch(`${url}/rest/v1/drops`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify(rows),
});
if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
console.log(`Uploaded ${rows.length} drops.`);
```

- [ ] **Step 5: Wire up `package.json` and `.gitignore`**

Add to `"scripts"`:

```json
"make-drops": "node --experimental-strip-types --env-file=.env.local scripts/make-drops.ts",
"review-drops": "node --experimental-strip-types scripts/review-drops.ts",
"upload-drops": "node --experimental-strip-types --env-file=.env.local scripts/upload-drops.ts",
```

Append to `.gitignore`:

```
# Daily Drop review page (regenerated)
drops/review.html
```

- [ ] **Step 6: Verify with a dry run**

Run: `npm run make-drops -- --dry-run`
Expected: prints today's date and 5 lines, one per slot, each with an artist, a song, a listener count inside that slot's range, and a genre. The 5 genres are all different. It ends with "Dry run — nothing written." `drops/drops.json` is not created. This takes a few minutes because of iTunes pacing.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/make-drops.ts scripts/review-drops.ts scripts/upload-drops.ts supabase/setup.sql package.json .gitignore
git commit -m "Add Daily Drop generator, review page, uploader and Supabase schema"
```

---

### Task 4: Supabase client and storage

**Files:**
- Create: `lib/supabase.ts`
- Modify: `lib/discovery-storage.ts`

**Interfaces:**
- Consumes: `Drop`, `DropVote`, `SongResult` (Task 1)
- Produces:
  - `fetchDrop(day: string): Promise<Drop | null>`
  - `sendVotes(day: string, deviceId: string, votes: DropVote[]): Promise<boolean>`, which returns true once the attempt is settled (sent, already sent, or permanently rejected) and false on a network or server error
  - `fetchResults(day: string): Promise<SongResult[] | null>`, which returns null when offline
  - `loadDeviceId(): Promise<string>`
  - `loadCachedDrop(): Promise<Drop | null>`, `saveCachedDrop(d: Drop)`
  - `type DropProgress = { day: string; votes: DropVote[] }`, with `loadDropProgress(): Promise<DropProgress | null>` and `saveDropProgress(p: DropProgress)`
  - `loadPendingVotes(): Promise<DropProgress[]>`, `savePendingVotes(p: DropProgress[])`
  - `appendLikedTrack` now skips a track id that is already saved

- [ ] **Step 1: Write `lib/supabase.ts`**

```ts
// Supabase over plain REST (PostgREST) — no client library. The anon key is
// safe to ship: row-level security (supabase/setup.sql) only allows reading
// current drops and the vote counts view, and inserting votes.
import type { Drop, DropVote, SongResult } from './daily-drop';

const URL_ROOT = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function headers(extra: Record<string, string> = {}) {
  return { apikey: KEY ?? '', Authorization: `Bearer ${KEY}`, ...extra };
}

export async function fetchDrop(day: string): Promise<Drop | null> {
  if (!URL_ROOT || !KEY) return null;
  try {
    const res = await fetch(`${URL_ROOT}/rest/v1/drops?day=eq.${day}&select=day,number,songs`, { headers: headers() });
    if (!res.ok) return null;
    const rows = (await res.json()) as Drop[];
    return rows[0]?.songs?.length === 5 ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function sendVotes(day: string, deviceId: string, votes: DropVote[]): Promise<boolean> {
  if (!URL_ROOT || !KEY) return false;
  try {
    const res = await fetch(`${URL_ROOT}/rest/v1/votes`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(votes.map((v) => ({ day, device_id: deviceId, position: v.position, liked: v.liked }))),
    });
    // Settled on any answer except a server error: 409 means these votes
    // already landed; other 4xx (e.g. a day too old for the insert policy)
    // will never succeed, so retrying forever would be pointless.
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function fetchResults(day: string): Promise<SongResult[] | null> {
  if (!URL_ROOT || !KEY) return null;
  try {
    const res = await fetch(`${URL_ROOT}/rest/v1/drop_results?day=eq.${day}&select=position,voters,likes`, { headers: headers() });
    return res.ok ? ((await res.json()) as SongResult[]) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Extend `lib/discovery-storage.ts`**

Change `appendLikedTrack` so a track id that is already saved isn't pushed again:

```ts
export async function appendLikedTrack(track: DiscoveryTrack): Promise<void> {
  try {
    const existing = await loadLikedTracks();
    if (existing.some((t) => t.id === track.id)) return;
    existing.push(track);
    await AsyncStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify(existing));
  } catch {
    // ignore
  }
}
```

Append:

```ts
// ---------- Daily Drop ----------

const DEVICE_ID_KEY = `${STORAGE_PREFIX}:deviceId`;
const CACHED_DROP_KEY = `${STORAGE_PREFIX}:cachedDrop`;
const DROP_PROGRESS_KEY = `${STORAGE_PREFIX}:dropProgress`;
const PENDING_VOTES_KEY = `${STORAGE_PREFIX}:pendingVotes`;

export type DropProgress = { day: string; votes: DropVote[] };

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/** A random v4 UUID, made once per install — one vote per phone per song. */
export async function loadDeviceId(): Promise<string> {
  const existing = await readJson<string | null>(DEVICE_ID_KEY, null);
  if (existing) return existing;
  const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
  await writeJson(DEVICE_ID_KEY, id);
  return id;
}

export const loadCachedDrop = () => readJson<Drop | null>(CACHED_DROP_KEY, null);
export const saveCachedDrop = (d: Drop) => writeJson(CACHED_DROP_KEY, d);
export const loadDropProgress = () => readJson<DropProgress | null>(DROP_PROGRESS_KEY, null);
export const saveDropProgress = (p: DropProgress) => writeJson(DROP_PROGRESS_KEY, p);
export const loadPendingVotes = () => readJson<DropProgress[]>(PENDING_VOTES_KEY, []);
export const savePendingVotes = (p: DropProgress[]) => writeJson(PENDING_VOTES_KEY, p);
```

Add `import type { Drop, DropVote } from './daily-drop';` to the imports.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && node --experimental-strip-types --test lib/discovery.test.ts lib/daily-drop.test.ts`
Expected: no type errors, and all tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase.ts lib/discovery-storage.ts
git commit -m "Add Supabase REST client and Daily Drop storage; dedupe liked tracks"
```

---

### Task 5: Play the drop on Home

**Files:**
- Create: `hooks/use-daily-drop.ts`
- Modify: `components/discovery/swipe-card.tsx`, `components/discovery/card-stack.tsx`, `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: Tasks 1 and 4
- Produces: `useDailyDrop(): { active: boolean; drop: Drop | null; cards: DiscoveryTrack[]; played: number; vote(liked: boolean): Promise<'more' | 'done'>; undo(): void; canUndo: boolean }`

- [ ] **Step 1: Write the hook**

```ts
// hooks/use-daily-drop.ts
import { useEffect, useState } from 'react';

import { dropToDiscoveryTracks, nextDropIndex, todayKey, type Drop, type DropVote } from '@/lib/daily-drop';
import {
  loadCachedDrop,
  loadDeviceId,
  loadDropProgress,
  loadPendingVotes,
  saveCachedDrop,
  saveDropProgress,
  savePendingVotes,
  type DropProgress,
} from '@/lib/discovery-storage';
import { fetchDrop, sendVotes } from '@/lib/supabase';

async function flushPending(deviceId: string, extra: DropProgress[] = []) {
  const pending = [...(await loadPendingVotes()), ...extra];
  const still: DropProgress[] = [];
  for (const p of pending) if (!(await sendVotes(p.day, deviceId, p.votes))) still.push(p);
  await savePendingVotes(still);
}

/** Today's drop: loads once per mount, resumes mid-drop, sends votes when finished. */
export function useDailyDrop() {
  const [drop, setDrop] = useState<Drop | null>(null);
  const [votes, setVotes] = useState<DropVote[]>([]);

  useEffect(() => {
    (async () => {
      const deviceId = await loadDeviceId();
      flushPending(deviceId);
      const progress = await loadDropProgress();
      // A drop in progress keeps its own day across midnight, but only
      // yesterday's — an older unfinished drop is a missed day.
      const today = todayKey(new Date());
      const yesterday = todayKey(new Date(Date.now() - 86_400_000));
      const resumable = progress && progress.votes.length < 5 && (progress.day === today || progress.day === yesterday);
      const day = resumable ? progress.day : today;
      const cached = await loadCachedDrop();
      const d = cached?.day === day ? cached : await fetchDrop(day);
      if (!d) return;
      await saveCachedDrop(d);
      setVotes(progress?.day === day ? progress.votes : []);
      setDrop(d);
    })();
  }, []);

  const played = nextDropIndex(votes);
  const active = !!drop && played < 5;
  const cards = drop ? dropToDiscoveryTracks(drop).slice(played) : [];

  async function vote(liked: boolean): Promise<'more' | 'done'> {
    if (!drop) return 'done';
    const next = [...votes, { position: played, liked }];
    setVotes(next);
    await saveDropProgress({ day: drop.day, votes: next });
    if (next.length < 5) return 'more';
    flushPending(await loadDeviceId(), [{ day: drop.day, votes: next }]);
    return 'done';
  }

  function undo() {
    if (!drop || votes.length === 0 || votes.length >= 5) return;
    const next = votes.slice(0, -1);
    setVotes(next);
    saveDropProgress({ day: drop.day, votes: next });
  }

  return { active, drop, cards, played, vote, undo, canUndo: active && votes.length > 0 };
}
```

- [ ] **Step 2: Add `allowDown` to the card**

In `components/discovery/swipe-card.tsx`:
- Add `allowDown?: boolean;` to `SwipeCardProps`.
- Destructure it with `allowDown = true`.
- In `pan.onEnd`, change `} else if (direction === 'down') {` to `} else if (direction === 'down' && allowDown) {`, so a disallowed down-drag springs back like an unresolved drag.

In `components/discovery/card-stack.tsx`:
- Add `allowDown?: boolean;` to `CardStackProps`.
- Destructure it.
- Pass `allowDown={allowDown}` to `SwipeCard`.

- [ ] **Step 3: Integrate into `app/(tabs)/index.tsx`**

1. Imports: `import { useDailyDrop } from '@/hooks/use-daily-drop';` and add `useRouter` (already imported) usage below.
2. After the `usePlayback()` line, add `const daily = useDailyDrop();` and `const [likedFlash, setLikedFlash] = useState(false);`.
3. Change `const currentTrack = queue[0];` to `const currentTrack = daily.active ? daily.cards[0] : queue[0];`. Move that line below `const daily = useDailyDrop();`, and move `usePlayback()` above it if needed. The player effect keyed on `currentTrack?.id` then plays drop previews with no other change.
4. Add a `source?: 'drop'` parameter. In `logSwipe(track, action)`, add a third parameter `source?: 'drop'` and include `...(source ? { source } : {})` in the entry. Add `source?: 'drop';` to `SwipeEntry` in `lib/discovery.ts` with the comment `// Set for Daily Drop swipes, so analysis can separate them from the feed.`
5. Add the handler:

```ts
async function handleDropSwipe(direction: SwipeDirection, track: DiscoveryTrack) {
  if (direction === 'down') return;
  const liked = direction === 'right';
  await logSwipe(track, liked ? 'like' : 'skip', 'drop');
  if (liked) {
    setLikedFlash(true);
    setTimeout(() => setLikedFlash(false), 600);
    await appendLikedTrack({ ...track, likedAt: Date.now() });
  }
  if ((await daily.vote(liked)) === 'done') {
    setUndoSnapshot(null);
    router.push('/drop-results');
  }
}
```

6. Undo button: `onPress={daily.active ? daily.undo : handleUndo}` and `disabled={daily.active ? !daily.canUndo : !undoSnapshot}`.
7. Genre pill: while `daily.active`, render a plain label in place of `<GenrePicker …/>`:

```tsx
{daily.active ? (
  <ThemedView style={styles.dropPill} backgroundColor={Colors.accent}>
    <ThemedText type="label" style={styles.dropPillText}>Daily Drop · {daily.played + 1}/5</ThemedText>
  </ThemedView>
) : (
  <GenrePicker … unchanged … />
)}
```

8. Card area: when `daily.active`, render the drop stack in place of the feed stack, then the "Liked" flash:

```tsx
{daily.active ? (
  <CardStack queue={daily.cards} cardSize={cardSize} onSwipe={handleDropSwipe} onHold={handleCardHold} playing={status.playing} showPlayIcon={showPlayIcon} allowDown={false} />
) : revealTrack ? ( …existing RevealCard… ) : ( …existing CardStack… )}
{likedFlash && (
  <ThemedView style={styles.likedFlash} backgroundColor="transparent" pointerEvents="none">
    <ThemedText type="subtitle" style={styles.likedFlashText}>Liked</ThemedText>
  </ThemedView>
)}
```

Wrap the render condition so the drop still shows while the feed queue is empty: change `{currentTrack ? (` to `{currentTrack || daily.active ? (`.

9. Steering during the drop: at the top of `handleMoreFromArtist` and `handleMoreLikeSound`, add `if (daily.active) return;`.
10. Styles:

```ts
dropPill: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: Radius.pill },
dropPillText: { color: Colors.accentText },
likedFlash: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
likedFlashText: { color: Colors.positive, fontSize: 32, lineHeight: 36 },
```

Add `Radius` to the `@/constants/theme` import.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx expo lint 2>&1 | grep problems`
Expected: no type errors. Lint shows the same 4 problems as before this plan (3 errors, 1 warning), with none new.

Manual check (once Task 7's setup is done, or with a hand-inserted `drops` row for today):
- Open the app. The pill reads "Daily Drop · 1/5" and the cards are blind.
- Swiping down does nothing.
- Undo works on vote 2.
- Kill the app after 2 swipes and reopen: it shows "3/5".
- The 5th swipe opens the results route (a 404 until Task 6).

- [ ] **Step 5: Commit**

```bash
git add hooks/use-daily-drop.ts components/discovery/swipe-card.tsx components/discovery/card-stack.tsx "app/(tabs)/index.tsx" lib/discovery.ts
git commit -m "Play the Daily Drop as the first five cards on Home"
```

---

### Task 6: Results screen and Profile line

**Files:**
- Create: `app/drop-results.tsx`
- Modify: `app/_layout.tsx`, `app/(tabs)/explore.tsx`

**Interfaces:**
- Consumes: `loadCachedDrop`, `loadDropProgress` (Task 4); `fetchResults` (Task 4); `crowdLabel`, `pickHeadline`, `shareText` (Task 1); `describeListeners` (`lib/discovery.ts`)
- Produces: route `/drop-results`

- [ ] **Step 1: Write the screen**

```tsx
// app/drop-results.tsx
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FlipInEasyY } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { crowdLabel, pickHeadline, shareText, type Drop, type DropVote, type SongResult } from '@/lib/daily-drop';
import { artworkUrl, describeListeners } from '@/lib/discovery';
import { loadCachedDrop, loadDropProgress } from '@/lib/discovery-storage';
import { fetchResults } from '@/lib/supabase';

export default function DropResultsScreen() {
  const router = useRouter();
  const [drop, setDrop] = useState<Drop | null>(null);
  const [votes, setVotes] = useState<DropVote[]>([]);
  const [results, setResults] = useState<SongResult[] | null>(null);

  useEffect(() => {
    (async () => {
      const [d, p] = await Promise.all([loadCachedDrop(), loadDropProgress()]);
      if (!d || p?.day !== d.day) return;
      setDrop(d);
      setVotes(p.votes);
      setResults(await fetchResults(d.day));
    })();
  }, []);

  if (!drop) return <ThemedView style={styles.container} />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="caption">Blindspot Daily #{drop.number}</ThemedText>
      <ThemedText type="subtitle">{pickHeadline(drop, votes, results ?? [])}</ThemedText>

      {drop.songs.map((s, i) => {
        const r = results?.find((x) => x.position === i);
        const liked = votes.find((v) => v.position === i)?.liked;
        const share = r && r.voters > 0 ? r.likes / r.voters : 0;
        return (
          <Animated.View key={s.itunesTrackId} entering={FlipInEasyY.delay(i * 500).springify().damping(14)}>
            <ThemedView style={styles.row} backgroundColor={Colors.surface}>
              <Image source={{ uri: artworkUrl(s.artworkUrl, 200) }} style={styles.art} />
              <ThemedView style={styles.info} backgroundColor="transparent">
                {s.slot === 'famous' && <ThemedText type="caption" style={styles.famous}>The secret famous one</ThemedText>}
                <ThemedText type="defaultSemiBold" numberOfLines={1}>{s.title}</ThemedText>
                <ThemedText numberOfLines={1} style={styles.dim}>{s.artist}</ThemedText>
                <ThemedText style={styles.count}>{describeListeners(s.listeners).count} listeners</ThemedText>
                <ThemedView style={styles.bar} backgroundColor={Colors.surfaceElevated}>
                  <ThemedView style={[styles.barFill, { width: `${Math.round(share * 100)}%` }]} backgroundColor={Colors.accent} />
                </ThemedView>
                <ThemedText type="caption">
                  {liked ? '♥ You liked it' : '✕ You skipped it'} · {results ? crowdLabel(r) : "Results when you're back online"}
                </ThemedText>
              </ThemedView>
            </ThemedView>
          </Animated.View>
        );
      })}

      <TouchableOpacity onPress={() => Share.share({ message: shareText(drop, votes) }).catch(() => {})}>
        <ThemedView style={styles.button} backgroundColor={Colors.surfaceElevated}>
          <ThemedText type="label">Share</ThemedText>
        </ThemedView>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.back()}>
        <ThemedView style={styles.button} backgroundColor={Colors.accent}>
          <ThemedText type="label" style={{ color: Colors.accentText }}>Keep swiping</ThemedText>
        </ThemedView>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.lg, gap: Spacing.md, backgroundColor: Colors.background, flexGrow: 1 },
  row: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md },
  art: { width: 72, height: 72, borderRadius: Radius.sm },
  info: { flex: 1, gap: 2 },
  dim: { color: Colors.textSecondary },
  famous: { color: Colors.accent, fontWeight: '700' },
  count: { color: Colors.accent, fontWeight: '800', fontSize: 18 },
  bar: { height: 6, borderRadius: Radius.pill, overflow: 'hidden', marginVertical: 4 },
  barFill: { height: 6 },
  button: { paddingVertical: Spacing.md, borderRadius: Radius.pill, alignItems: 'center' },
});
```

- [ ] **Step 2: Register the route**

In `app/_layout.tsx`, add after the `export-history` screen:

```tsx
<Stack.Screen name="drop-results" options={{ presentation: 'fullScreenModal', headerShown: false }} />
```

- [ ] **Step 3: Add the Profile line**

In `app/(tabs)/explore.tsx`:
- Import `loadCachedDrop` and `loadDropProgress`, plus `todayKey`, `type Drop` and `type DropVote` from `@/lib/daily-drop`, and `useRouter` and `TouchableOpacity`.
- Add state `const [todayDrop, setTodayDrop] = useState<{ drop: Drop; votes: DropVote[] } | null>(null);`.
- In the focus effect's async block, also load `loadCachedDrop()` and `loadDropProgress()`. Set `todayDrop` when `drop?.day === todayKey(new Date()) && progress?.day === drop.day && progress.votes.length === 5`, and set it to `null` otherwise.
- Render right under the title:

```tsx
{todayDrop && (
  <TouchableOpacity onPress={() => router.push('/drop-results')}>
    <ThemedText type="link">
      Today&apos;s drop: liked {todayDrop.votes.filter((v) => v.liked).length}/5 · see results
    </ThemedText>
  </TouchableOpacity>
)}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx expo lint 2>&1 | grep problems`
Expected: no type errors, and the same 4 pre-existing lint problems.

Manual check:
- After the 5th drop swipe, the results show 5 rows flipping in about 0.5s apart, with the famous one labelled.
- Share opens the share sheet with the grid text, containing no artist names.
- "Keep swiping" returns to the feed.
- Profile shows the "Today's drop" line, which reopens results.
- In airplane mode, the rows read "Results when you're back online".

- [ ] **Step 5: Commit**

```bash
git add app/drop-results.tsx app/_layout.tsx "app/(tabs)/explore.tsx"
git commit -m "Add Daily Drop results screen and Profile link"
```

---

### Task 7: Setup, first real run, docs

**Files:**
- Modify: `CLAUDE.md`
- Create: `drops/drops.json` (generated)

- [ ] **Step 1: Supabase setup (Ilan, about 10 minutes)**

1. Go to supabase.com → New project (free), and set a database password.
2. Open SQL Editor → New query → paste `supabase/setup.sql` → Run. It should report "Success. No rows returned".
3. Go to Project Settings → API. Copy the Project URL, the `anon` public key, and the `service_role` secret key.
4. Add them to `.env.local`:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_KEY=<service_role key>
```

- [ ] **Step 2: Generate, review, upload**

Run: `npm run make-drops`
Expected: about 30–40 minutes. It prints each day and its 5 songs, and ends with "All days through 2026-12-31 are picked." If it's stopped, rerun it; it continues where it left off.

Run: `npm run review-drops && open drops/review.html`
Expected: a page listing each upcoming day with 5 players.

Run: `npm run upload-drops`
Expected: "Uploaded N drops."

Verify RLS from a terminal with the anon key:

```bash
set -a; . ./.env.local; set +a
curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/drops?select=day&order=day.desc&limit=1" -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY"
curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/votes?select=*" -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY"
```

Expected:
- The first call returns only a day no later than tomorrow (UTC), never 2026-12-31.
- The second call returns `[]`, because rows aren't readable.

- [ ] **Step 3: Play it end to end on the phone**

Restart `npx expo start` so the new env vars load, then play today's drop on the phone.

Expected:
- The results show "1 of 1 liked" or "0 of 1 liked" per song.
- The Supabase table editor shows 5 rows in `votes`.
- Playing again on the same phone doesn't add rows. The drop shows as finished, and a resend gets 409, which is treated as sent.

- [ ] **Step 4: Update `CLAUDE.md`**

Add under the Home tab bullets:

```
  - **Daily Drop** (`hooks/use-daily-drop.ts`, `lib/daily-drop.ts`, spec `docs/superpowers/specs/2026-09-29-daily-drop-design.md`): if today's drop exists and isn't finished, its 5 blind songs are the first cards (down-swipe off, pill reads "Daily Drop · n/5"); the 5th swipe sends votes (`lib/supabase.ts`, plain REST) and opens `app/drop-results.tsx`. Drops are made offline by `npm run make-drops` → `review-drops` → `upload-drops` (`scripts/`), schema in `supabase/setup.sql`.
```

Add to Commands:

```
- Daily Drop: `npm run make-drops` (picks days through 2026-12-31 into `drops/drops.json`; `--dry-run`, `--redo <day> [--slot <slot>]`, `--showcase <day>` then `--choose <day> slot=n …`), `npm run review-drops` (writes `drops/review.html`), `npm run upload-drops` (needs `SUPABASE_SERVICE_KEY`).
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md drops/drops.json
git commit -m "Generate Daily Drops through Dec 31 and document the Daily Drop"
```
