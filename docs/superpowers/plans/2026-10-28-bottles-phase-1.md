# Bottles Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saving a blind find on Home floats it to a stranger. Bottles wash up blind in other people's feeds, keeping one carries it on, and each bottle grows a print made of the songs its keepers love.

**Architecture:** The Supabase SQL follows the Twins pattern: anonymous-auth users, RLS on, `security definer` RPCs only. Small pure modules hold every rule (mixing, outbox and undo, validation, place, journey text, news, rings), each with Node tests. One network module talks to PostgREST `/rpc/*`. Home, Finds News, Tune and the Library call that module.

**Tech Stack:** Expo SDK 58, React Native, TypeScript, Skia 2.14 (prints), Supabase over plain REST, `expo-location` (already in the app), Node's test runner, and PGlite to simulate the SQL (dev only, installed outside the repo).

**Spec:** `docs/superpowers/specs/2026-10-28-bottles-design.md`

## Global Constraints

- No new native modules. Reach `expo-location` only through `lib/run-native.ts` `runNative()`.
- The phone never plays or shows a URL from the server. It resolves the track id through the bundled catalog, then a paced iTunes lookup.
- At most 1 bottle in every 5 cards. None in the first 5 songs. None while steering with an artist, in map focus, in the Drop, on a run, or when Test network is Offline.
- A bottle sinks after 5 passes in a row and retires after 3 Unplayable reports. A person can launch 20 a day. Old finds float once, up to 30.
- Launch needs at least 10 s of listening (`RATED_LISTEN_THRESHOLD_MS`).
- Counts show only after the verdict. The reveal shows only "Washed up from <city>".
- Coordinates are rounded to 0.5° on the phone. The city comes from reduced-accuracy location (the student chose "use my city"), with a time-zone region as the fallback.
- No free text anywhere in Bottles.
- Copy uses sentence case. Prints sit on dark tiles (Minimal UI rule).
- Tests: `node --experimental-strip-types --test $(git ls-files '*.test.ts')`. Typecheck: `npx tsc --noEmit`. Pure modules import siblings with a `.ts` extension, like the existing `lib/*.ts`.
- Only format new files with Prettier, using `--single-quote --print-width 130 --bracket-same-line --trailing-comma es5`.

## Review Focus

1. **Undo right after a bottle leaves.** The pending verdict must vanish, and the server must never see it. Task 3 tests `unstage` after `stage`.
2. **Hostile or garbage rows** (a huge city string, NaN coordinates, an unknown state, 10k hops). They're dropped or clamped, never a crash. Task 2 tests these.
3. **Two phones claiming at the same moment.** Only one may hold a bottle. Task 1's simulation runs concurrent claims.
4. **Offline then online.** Queued launches and verdicts send once, in order. A late verdict for a bottle someone else holds now is dropped. Tasks 1 and 6 cover this.
5. **Location denied, or the web.** The time-zone region is used and nothing throws. Task 4 tests `placeFromTimeZone` for America/Chicago → "Central US", never "Chicago".

---

### Task 1: The server: `supabase/bottles.sql` and its simulation

**Files:**
- Create: `supabase/bottles.sql`
- Create: `supabase/bottles-sim.mjs` (not a `*.test.ts`, so the app's test glob skips it; the header says how to run it)

**Interfaces:**
- Produces these RPCs, all `security definer set search_path = public`, `grant execute … to authenticated` and revoked from anon. Each returns `json`:
  - `float_bottle(p_track_id bigint, p_artist_key text, p_genre_tag text, p_place json)` → `{ id }`, `{ error: 'cap' }` or `{ error: 'duplicate' }`. `p_place` = `{ city, country, lat, lng, exact }`.
  - `claim_bottle(p_genre_tag text)` → `null` or a bottle object (shape below), with its holder set and a lease of `now() + interval '2 hours'`.
  - `decide_bottle(p_id uuid, p_verdict text, p_place json, p_tier text, p_ring json)` → `{ ok: true, keeps, state }` or `{ ok: false }`. False when the caller doesn't hold the bottle and someone else does.
  - `my_bottles(p_since timestamptz)` → a json array of the bottle objects the caller launched or kept with `last_moved_at > p_since` (or all, when null).
- Bottle object: `{ id, track_id, artist_key, genre_tag, keeps, passes, state, last_moved_at, hops: [{ kind, city, country, lat, lng, tier, ring, at }] }`, with hops in time order. `ring` = `{ key, mode, energy, tempo }` or null.

- [ ] **Step 1: Write the simulation first.** `bottles-sim.mjs` loads PGlite from `process.env.PGLITE` (a path to `@electric-sql/pglite`). It creates a stub `auth` schema: `auth.users(id uuid pk)`, `auth.uid()` reading `current_setting('request.jwt.claim.sub', true)`, roles `anon` and `authenticated`, and `ai_reports` with the `ai_reported` view copied from `supabase/ai-reports.sql`. Then it runs `bottles.sql`. With 12 fake users, assert:
  - `float_bottle` works, and the 21st on the same day returns `cap`.
  - A claim never returns the caller's own bottle, a bottle the caller already got, or a bottle someone else holds under a live lease.
  - 5 passes in a row set `state = 'sunk'`, and a keep resets the count.
  - Keeps append hops in order, and no user shows up in one bottle's hops twice.
  - 3 Unplayable reports from different users set `retired`. Known changes no counters.
  - An expired lease can be claimed again. The old holder's late `decide_bottle` returns `ok: false` once someone else holds it, and `ok: true` when no one does.
  - Two claims run together (`Promise.all`) never both get the same bottle.
  - The claim prefers the caller's genre, then any genre. Over 20 claims, the freshest and longest-waiting bottles alternate.
  - An artist reported 3 times in `ai_reports` is never claimed.
  - Under `set role authenticated`, direct `select` on `bottles`, `bottle_hops` or `bottle_offers` fails.
- [ ] **Step 2: Run it and watch it fail.** Install PGlite outside the repo: `npm i --prefix <scratchpad>/pglite @electric-sql/pglite`. Run `PGLITE=<scratchpad>/pglite/node_modules/@electric-sql/pglite/dist/index.js node supabase/bottles-sim.mjs`. Expected: it fails because `bottles.sql` is missing.
- [ ] **Step 3: Write `bottles.sql`** with the three tables from the spec. `bottle_offers` has primary key `(bottle_id, user_id)` and a `verdict` check (`'keep' | 'pass' | 'known' | 'unplayable'`). Every text column gets a length check: city/country ≤ 80, artist_key ≤ 120, genre_tag ≤ 60. Lat/lng get range checks. Enable RLS with no policies and no grants. Use `for update skip locked` in `claim_bottle` so concurrent claims can't collide. Alternate fresh and longest-waiting with `random() < 0.5`. The sim checks the alternation statistically: both orders must show up at least 5 times in 20 claims.
- [ ] **Step 4: Run the sim and watch it pass.** Same command. Expected: `bottles sim: all N checks passed`.
- [ ] **Step 5: Commit** `supabase/bottles.sql supabase/bottles-sim.mjs` with the message "Bottles server: float, claim with a 2-hour lease, keep/pass/sink, my bottles; PGlite simulation of 12 phones".

### Task 2: Types and untrusted rows: `lib/bottle-rows.ts`

**Files:** Create `lib/bottle-rows.ts` and `lib/bottle-rows.test.ts`.

**Interfaces:**
- Produces:
  - `type Tier = 'close' | 'new' | 'deep'`, re-exported from `lib/taste-distance.ts`.
  - `type RingSeed = { key: number | null; mode: 0 | 1 | null; energy: number; tempo: number }`
  - `type Place = { city: string; country: string; lat: number; lng: number; exact: boolean }`
  - `type Hop = { kind: 'launch' | 'keep'; city: string; country: string; lat: number; lng: number; exact: boolean; tier: Tier | null; ring: RingSeed | null; at: string }` (`exact` defaults to true when missing)
  - `type BottleState = 'floating' | 'sunk' | 'retired'`
  - `type Bottle = { id: string; trackId: number; artistKey: string; genreTag: string; keeps: number; passes: number; state: BottleState; lastMovedAt: string; hops: Hop[] }`
  - `type Verdict = 'keep' | 'pass' | 'known' | 'unplayable'`
  - `parseBottle(row: unknown): Bottle | null` and `parseBottles(rows: unknown): Bottle[]`

- [ ] **Step 1: Write the failing tests:**
  - `parses a good row`: snake_case → camelCase, hops kept in order.
  - `drops a row with a bad id, a track id ≤ 0, or an unknown state`.
  - `clamps strings`: a city of 5,000 chars is cut to 80, and control characters are stripped.
  - `drops hops with NaN or out-of-range coordinates`, but keeps the bottle.
  - `caps hops at 500`, keeping the first 500.
  - `ring seed`: key 12 makes `ring` null; energy 1.7 makes it null; mode 2 makes it null.
  - `parseBottles skips non-objects and keeps the good ones`.
  - `parseBottles(null) is []`.
- [ ] **Step 2: Run** `node --experimental-strip-types --test lib/bottle-rows.test.ts`. Expected: FAIL, with the module not found.
- [ ] **Step 3: Implement** with plain type guards and no libraries.
- [ ] **Step 4: Run it again.** Expected: PASS.
- [ ] **Step 5: Commit** with the message "Bottles: types and validation of rows from strangers".

### Task 3: Feed rules and the outbox: `lib/bottles.ts`

**Files:** Create `lib/bottles.ts` and `lib/bottles.test.ts`.

**Interfaces:**
- Consumes: `Verdict`, `Place`, `Tier` and `RingSeed` from Task 2. `DiscoveryTrack` and `RATED_LISTEN_THRESHOLD_MS` from `lib/discovery.ts`.
- Produces:
  - `const BOTTLE_EVERY = 5`, `FIRST_SONGS_WITHOUT = 5`, `LAUNCHES_PER_DAY = 20`, `OLD_FINDS_MAX = 30`
  - `type FeedMode = 'genre' | 'sorted' | 'artist' | 'map'`
  - `bottleSlotOpen(i: { enabled: boolean; offline: boolean; mode: FeedMode; songsHeard: number; cardsSinceBottle: number }): boolean`
  - `canLaunch(track: DiscoveryTrack, listenMs: number, launchesToday: number): boolean`. False for `via === 'bottle'`, below 10 s, or at the cap. Drop and Run songs never reach Home's save path.
  - `type OutboxItem = { kind: 'launch'; id: string; trackId: number; artistKey: string; genreTag: string; place: Place | null; at: number } | { kind: 'verdict'; id: string; bottleId: string; verdict: Verdict; place: Place | null; tier: Tier | null; ring: RingSeed | null; at: number }`
  - `type Outbox = { pending: OutboxItem | null; queued: OutboxItem[] }` and `const EMPTY_OUTBOX: Outbox`
  - `stage(o, item): Outbox`: the previous pending item moves to queued.
  - `unstage(o): Outbox`: Undo.
  - `commit(o): Outbox`: on background, pending moves to queued.
  - `sent(o, ids: string[]): Outbox`
  - `oldFinds(history: SwipeEntry[], liked: DiscoveryTrack[]): DiscoveryTrack[]`: liked tracks whose `like` entry has `listenMs ≥ 10_000` and no `source` of drop or bottle, newest first, at most 30.
- Also add `'bottle'` to `DiscoveryTrack.via` and `SwipeEntry.source` in `lib/discovery.ts`, and add `bottleId?: string` and `bottle?: Bottle` (the hidden chain) to `DiscoveryTrack`.

- [ ] **Step 1: Write the failing tests:**
  - `slot opens on the 5th card after the last bottle in genre mode`: `cardsSinceBottle` 4 → true, 3 → false.
  - `no slot in the first 5 songs`.
  - `no slot in artist or map mode, offline, or disabled`.
  - `sorted mode allows a slot`.
  - `canLaunch refuses bottles, short listens and the 21st launch`.
  - `stage then unstage leaves the queue untouched`.
  - `stage twice moves the first item to queued`.
  - `commit moves pending to queued`.
  - `sent removes only those ids`.
  - `oldFinds keeps 10 s+ feed likes, newest first, max 30, and skips drop/bottle entries`.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it and watch it pass.** Also run `npx tsc --noEmit`: the `via`/`source` widening must compile everywhere.
- [ ] **Step 5: Commit** with the message "Bottles: when a bottle may wash up, who may launch, and an undo-aware outbox".

### Task 4: Place: `lib/bottle-place.ts`

**Files:** Create `lib/bottle-place.ts` and `lib/bottle-place.test.ts`.

**Interfaces:**
- Produces:
  - `const ROUND_DEG = 0.5`
  - `roundCoord(x: number): number`
  - `placeFromGeocode(g: { city?: string | null; subregion?: string | null; region?: string | null; country?: string | null }, lat: number, lng: number): Place | null`. Uses the city, falling back to the subregion and then the region. Null without any of them or without a country. Coordinates are rounded and `exact` is true.
  - `placeFromTimeZone(tz: string): Place`, with `exact: false` and labels like "Somewhere in Central US". It uses a table for the US zones (`America/New_York`, `Chicago`, `Denver`, `Phoenix`, `Los_Angeles`, `Anchorage`, `Pacific/Honolulu`), `America/Mexico_City` and `Africa/Johannesburg`. Otherwise it falls back on the prefix (Europe, Asia, Africa, America → "the Americas", Australia, Pacific), and finally "Somewhere on Earth".

- [ ] **Step 1: Write the failing tests:**
  - `rounds to the nearest 0.5`: 32.78 → 33, -96.8 → -97, 32.7 → 32.5.
  - `geocode uses the city`.
  - `geocode falls back to subregion then region`.
  - `geocode without a country is null`.
  - `America/Chicago is Central US, never Chicago`.
  - `Europe/Lisbon falls back to Europe`.
  - `garbage tz is Somewhere on Earth`.
- [ ] **Step 2: Run it and watch it fail.** **Step 3: Implement.** **Step 4: Run it and watch it pass.**
- [ ] **Step 5: Commit** with the message "Bottles: city to 0.5°, time-zone region fallback".

### Task 5: Journey words, news and the bottle's print

**Files:**
- Create `lib/bottle-journey.ts` with `lib/bottle-journey.test.ts`, and `lib/bottle-print.ts` with `lib/bottle-print.test.ts`.
- Modify `lib/print-recipe.ts`: export `keyHue(key: number, mode: 0 | 1 | null): number` (the hue lines in `recipeFor`) and `hslToHex`. `recipeFor` calls `keyHue`, with no change in output.
- Create `components/bottles/bottle-print.tsx`, plus `bottle-print-canvas.tsx` loaded lazily like `components/print/print-still.tsx`.

**Interfaces:**
- Produces in `bottle-journey.ts`:
  - `ordinal(n: number): string`
  - `revealLine(b: Bottle): string`, giving "Washed up from Lisbon", or "Washed up from somewhere in Central US" when the launch hop isn't exact.
  - `keepLine(b: Bottle): string`, giving "You're the 3rd person to keep this. It's floating on." where people = 1 + keeps before you, plus you.
  - `routeStops(b: Bottle): { label: string; count: number; you: boolean }[]`. Consecutive same-city hops collapse ("Dallas", count 3).
  - `journeySummary(b: Bottle, waitingForSomeoneNew: boolean): string`. Floating gives "Kept by 4 people in 3 cities". Sunk gives "Sank after 9 people kept it". Waiting gives "Still drifting · waiting for someone new".
  - `type BottleSeen = Record<string, { keeps: number; state: BottleState }>`
  - `bottleNews(mine: Bottle[], seen: BottleSeen, titleOf: (trackId: number) => string | null): { id: string; bottleId: string; trackId: number; sentence: string }[]`. New keeps give "Your find *Title* washed up in Seoul and was kept · 4 people, 3 cities." Newly sunk gives "*Title* sank after 9 people kept it." Unknown titles are skipped.
- Produces in `bottle-print.ts`:
  - `ringSeedOf(f: SoundFeatures | null): RingSeed | null`
  - `type BottleRing = { radius: number; weight: number; color: string; beat: number; wobble: number }`
  - `bottleRings(hops: Hop[]): BottleRing[]`. One ring per keep hop, the last 12 at most. Radii are spread evenly from 0.36 to 0.49. Wobble by tier: close 0.008, new 0.018, deep 0.03, null 0.012. With a seed, color = `hslToHex(keyHue(key, mode), 0.62, 0.62)`, weight = 0.15 + 0.5 × energy, beat = 60 / `visualTempo(tempo)`. With no seed, color = `#f3ead8`, weight 0.12 and beat 1.
- `BottlePrint` props: `{ trackId: number; hops: Hop[]; size: number; drawLastRing?: boolean }`. The core is `settledPrint(recipeFor(trackId, soundFor(trackId), null), 'mini')`, and the rings breathe at their own beat. With `drawLastRing`, the newest ring strokes in over 700 ms.

- [ ] **Step 1: Write the failing tests:**
  - `ordinal 1st 2nd 3rd 4th 11th 12th 13th 21st 22nd`.
  - `revealLine exact and region`.
  - `keepLine counts the finder`: keeps 0 → "2nd".
  - `routeStops collapses Dallas Dallas Lisbon`.
  - `journeySummary floating/sunk/waiting`.
  - `bottleNews reports a new keep once`: after `seen` is updated, nothing.
  - `bottleNews reports sinking`.
  - `bottleNews skips unknown titles`.
  - `keyHue matches recipeFor`: recipeFor output is unchanged for 20 sampled index songs (snapshot of the ring colors before the refactor).
  - `bottleRings spaces radii 0.36–0.49`.
  - `bottleRings caps at 12`.
  - `bottleRings uses cream for no seed`.
  - `deep wobbles more than close`.
- [ ] **Step 2: Run it and watch it fail.** **Step 3: Implement** the pure files, then the component. **Step 4: Run the tests and `tsc`, and watch both pass.**
- [ ] **Step 5: Commit** with the message "Bottles: journey words, news, and a print made of the songs its keepers love".

### Task 6: Network and storage: `lib/bottles-api.ts`

**Files:** Create `lib/bottles-api.ts`. Network glue isn't unit-tested here; its pure parts live in Tasks 2–5.

**Interfaces:**
- Consumes: `ensureSession` (`lib/auth.ts`), `parseBottle`/`parseBottles` (Task 2), the outbox functions (Task 3), place (Task 4), `runNative()`, `allCatalogs`/`catalogTrack`/`trackToDiscoveryTrack`/`pacedItunes` (`lib/pool.ts`), and `parseArtistLookupResponse` (`lib/discovery.ts`).
- Produces:
  - `loadBottlesOn(): Promise<boolean | null>` (null = never asked) and `saveBottlesOn(on: boolean)`
  - `useBottlesOn(): boolean | null`, via `useSyncExternalStore` (React Compiler rule)
  - `currentPlace(ask: boolean): Promise<Place>`. Caches for 24 h. With `ask`, it requests foreground permission and uses `Accuracy.Lowest` plus `reverseGeocodeAsync`. Otherwise, or on any failure, it uses `placeFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)`.
  - `claimBottle(genreTag: string | null): Promise<Bottle | null>`
  - `resolveBottleTrack(b: Bottle, region: Region): Promise<DiscoveryTrack | null>`. Builds an id → catalog index once, falls back to `https://itunes.apple.com/lookup?id=<id>&country=<region>` through `pacedItunes`, and sets `via: 'bottle'`, `bottleId` and `bottle`.
  - `queueOutbox(change: (o: Outbox) => Outbox): Promise<void>`, persisted under `blindspotDiscovery:bottleOutbox`.
  - `flushOutbox(): Promise<void>`. Sends queued items in order. A 4xx other than 429 drops the item, and anything else keeps it. Single-flight.
  - `myBottles(since: string | null): Promise<Bottle[] | null>`
  - `launchesToday(): Promise<number>` and `noteLaunch()`, stored per local day.
- Every request: `POST ${EXPO_PUBLIC_SUPABASE_URL}/rest/v1/rpc/<fn>` with `apikey` and `Authorization: Bearer <session token>`, and a 10 s `AbortController` timeout. Results go through Task 2's parsers.

- [ ] **Step 1: Implement**, following `lib/twins-api.ts` for the session and error style.
- [ ] **Step 2: Run `npx tsc --noEmit` and the whole test suite.** Both must be clean.
- [ ] **Step 3: Commit** with the message "Bottles: RPC calls, a persisted outbox, the city, and resolving a bottle's song locally".

### Task 7: Home: bottles in the feed, verdicts, undo, launch, the reveal line, the keep moment and consent

**Do this after `minimal-ui-2` lands.** Rebase `bottles` onto it first.

**Files:**
- Modify `app/(tabs)/index.tsx`.
- Create `hooks/use-bottles.ts`, `components/bottles/keep-moment.tsx` and `components/bottles/consent-card.tsx`.
- Modify the reveal info component (`components/home/listen-info.tsx`, or the redesign's equivalent) and `components/home/saved-toast.tsx`.

**Interfaces:**
- `useBottles()` returns:
  - `{ on: boolean | null; cardsSinceBottle: number; noteCard(wasBottle: boolean): void; maybeBottle(genre: string | null, mode: FeedMode, songsHeard: number, offline: boolean): Promise<DiscoveryTrack | null>; exit(track: DiscoveryTrack, saved: boolean, listenMs: number, genreTag: string): Promise<KeepMoment | null>; undo(): void }`
  - `type KeepMoment = { bottle: Bottle; ring: RingSeed | null; tier: Tier | null }`
- `exit`:
  - For a bottle card, it stages a verdict: keep if saved, otherwise pass. It returns a KeepMoment when kept.
  - For a normal card that was saved, where `canLaunch` passes and `on` is true, it stages a launch.
  - The previous pending item commits first.
  - `ring` = `ringSeedOf(soundFor(previous saved track id))`, and `tier` = `tierFor(tasteDistance(...))` when available.
- AppState `background` → `commit` + `flushOutbox`.

- [ ] **Step 1: Mix a bottle into the refill.** In `runRefill`, after `nextQueue` arrives and if `maybeBottle(...)` returns a track that isn't in seen ids, insert it at index 1 (never replacing the playing card). A filtered bottle is staged as `known` and committed at once. Mode comes from the strategy, `mapFocusRef` and the sound filter. Offline comes from `networkTestRef.current === 'offline'`.
- [ ] **Step 2: Call `exit` wherever a card leaves the top:** `handleSkip`, `handleRevealDone`, the genre jump, and the Drop/steering paths that drop the card. `saved` = this card was saved before it left. Log `source: 'bottle'` for bottle cards in `logSwipe`.
- [ ] **Step 3: Make Undo** call `bottles.undo()` next to the existing snapshot restore.
- [ ] **Step 4: The reveal line.** A bottle card's revealed info shows `revealLine(track.bottle)` under the release line, in secondary text. There's no count.
- [ ] **Step 5: The keep moment.** When `exit` returns a KeepMoment, show `KeepMoment` over the stack's lower edge for 3.5 s, tappable to dismiss. It has `BottlePrint` with `drawLastRing` (your ring is included at the end), `keepLine` and the route strip from `routeStops` (newest stop glowing). Fire a light haptic as the ring lands. It must never block the next card's gestures.
- [ ] **Step 6: Consent and the toast.**
  - The first organic save while `on === null` opens `ConsentCard`: "Your saves float to strangers, blind. Only your city goes with them." The buttons are [Use my city] and [Not now].
  - Use my city: `saveBottlesOn(true)` and `currentPlace(true)`.
  - Not now: also `saveBottlesOn(true)`, but with the place from the time zone. A later switch in Tune turns it off. *(Rule from the spec: "Not now" still floats, with a region.)*
  - After consent, offer "Float your N blind finds" once (`oldFinds`), queueing up to 30 launches.
  - The toast reads "Saved to Liked Songs · floating to someone" when a launch was staged.
  - For the first 3 launches, a small light lifts from the card toward the top edge (600 ms, `Haptics.selectionAsync`).
- [ ] **Step 7: Run `tsc` and the full test suite**, then commit with the message "Bottles on Home: wash up blind, keep or pass, undo, launch on save, the keep moment".

### Task 8: Finds News, Library, Tune

**Files:**
- Modify `lib/finds-news.ts`, adding a `'bottle'` item type.
- Modify `hooks/use-finds-news.ts`, which calls `myBottles(lastSeen)` → `bottleNews`, with `BottleSeen` stored under `blindspotDiscovery:bottleSeen`.
- Modify the Finds News sheet.
- Modify the Library row component: a wave mark when the track id has a bottle in `myBottles`.
- Create `components/bottles/journey-sheet.tsx` (BottlePrint, `journeySummary`, a hop list with city and day, and its state).
- Modify `TuneSheet`, adding a "Bottles" switch with the subtext "Your saves float to strangers; theirs wash up for you".

- [ ] **Step 1: Test** that `buildFindsNews` merges bottle items after milestones. Add the test to `lib/finds-news.test.ts`.
- [ ] **Step 2: Implement it**, then run the tests and watch them pass.
- [ ] **Step 3: Wire the UI**, then run `tsc`.
- [ ] **Step 4: Commit** with the message "Bottles: news of your finds, the wave mark and journey sheet, the Tune switch".

### Task 9: Docs, checks, phone build

- [ ] Update `CLAUDE.md` (a Bottles bullet under Home), `features.md` (a `## [2026-10-28] Bottles` entry) and `changelog.md`.
- [ ] Run the full test suite, `tsc` and the sim. Paste the counts into the final report.
- [ ] Do a web check at 390pt: seed a bottle card by stubbing `claimBottle` in a dev-only flag, then take screenshots of the reveal line, the keep moment and the journey sheet. The location fallback runs on the web.
- [ ] The student runs `supabase/bottles.sql` in the Supabase dashboard. Then build an Expo Go update on branch `expo-go` only, and make a QR at `~/Desktop/blindspot-bottles-qr.png`. Two-phone test: save on phone A, and it washes up on phone B within 5 cards.
- [ ] Commit the docs.
