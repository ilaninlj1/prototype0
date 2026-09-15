# Bugs

Known bugs and issues, logged as dated entries. At the start of every session, entries older
than 30 days are flagged as a reminder (see the checklist in `CLAUDE.md`).

Add new entries at the top, newest first.

## Format

```
## [YYYY-MM-DD] Short title
Description of the bug, repro steps, and any relevant context.
```

## Entries

<!-- Add entries below this line -->

## [2026-09-14] fetchTracksByGenre serves chart-relevance results, not genre-representative ones — live, not a stale path

`fetchTracksByGenre` (`lib/discovery.ts:324-333`) issues a bare
`search?term=<genre>&entity=song` — a relevance search on the genre name
itself, no artist targeting — and iTunes's relevance ranking for a generic
one-word query skews heavily toward chart/popularity signal. This is **live
in production today**, not a dead or fallback path:

- `app/(tabs)/index.tsx` starts every session on a `{ type: 'genre', ... }`
  strategy (`randomGenre()`, line ~147) and swipe-down jumps
  (`pickJumpGenre`, lines 252-255) land on another genre strategy — both go
  through `fetchForStrategy` → `fetchTracksByGenre`. This is the default,
  most-traveled path through the whole app.
- `fetchTracksByArtist`'s correct call shape (`lookup?id=<artistId>`) is
  only reached via `applySteeringStrategy('artist', ...)` — i.e. only after
  a user explicitly steers to "more from this artist."

**Decision (2026-09-14): not fixing this in place.** The correct fix is
Last.fm-driven artist enumeration (the pool-steering control's Phase 1),
which supersedes this function rather than patching its query. Phase 1
must retire `fetchTracksByGenre` and route the genre strategy — both
initial load and swipe-down jump — through the new pool instead.

**What breaks when it's retired, flagged for Phase 1:**

- **Region toggle stops affecting genre browsing.** `fetchTracksByGenre`
  takes a `region: Region` param (US/MX/ZA storefront,
  `2026-09-05-region-storefront-design.md`); the pool-steering spec's
  `getTracks(preset, genreTag, excludeArtists)` has no region parameter.
  Unless Phase 1 threads a region through, the toggle silently stops doing
  anything for the default browsing mode (it'd still affect
  `fetchTracksByArtist` calls from steering).
- **"Discovered" genres and "more like this sound" steering have no route
  into the new pool.** `GenrePicker`'s taxonomy (`components/discovery/
  genre-taxonomy.ts`) surfaces a synthetic "Discovered" section built from
  raw iTunes `primaryGenreName` strings outside the curated `GENRES` list
  (e.g. "Urbano latino", "Punjabi Pop"), and `SteeringRow`'s "more like
  this sound" sets `{ type: 'genre', genre: currentTrack.primaryGenreName }`
  directly — also a raw iTunes string, not guaranteed to be a curated
  `GENRES` entry. `assets/genres.json` is only ever keyed by the curated
  list (Phase 0 seeds from `GENRES`), so either of these can hand the new
  pool a `genreTag` with no seed entry at all.
- **`GENRE_TERM_OVERRIDES`, `isGenreRelated`, `isGenericGenreTitle`, and
  `parseGenreSearchResponse`** (`lib/discovery.ts`) become dead code — no
  caller left once `fetchTracksByGenre` is gone.
- **12 tests in `lib/discovery.test.ts`** exercise this machinery directly
  (`isGenreRelated` ×6, `isGenericGenreTitle` ×5, `parseGenreSearchResponse`
  ×2 — some overlap) and go stale at the same time.

## [2026-09-05] Generic genre-titled tracks polluting genre search results

`fetchTracksByGenre` does plain free-text search (`search?term={genre}`), so
a track literally titled after the genre ("Techno", "Amapiano") ranks highly
for that term regardless of whether it's a real song. Measured live: raw
`primaryGenreName` mismatch rates of 23.5%-82.5% across five genres, and even
what survived the existing `isGenreRelated` filter was up to 15% generic,
single-producer tracks literally titled the genre name (9/59 kept results
for Amapiano, 5/153 for Techno).

Evaluated two potential fixes before choosing one — see
`docs/superpowers/specs/2026-09-05-generic-genre-title-filter-design.md`:

- `genreId` and the documented `attribute=genreIndex` as a real server-side
  genre constraint — both verified dead live (silently ignored, same failure
  mode `offset` turned out to have — see the Features log for that).
- A broad filter requiring `primaryGenreName` to exactly equal the searched
  genre — rejected: it zeroes reggaeton's pool entirely (iTunes never tags
  anything literally "Reggaeton") and cuts Techno's by 93% (153 → 11 lifetime
  results, since there's no real pagination to refill from), because it
  defeats `GENRE_TERM_OVERRIDES`, which exists specifically for genres
  iTunes doesn't literally tag.

Fix: `isGenericGenreTitle` — narrow, exact-match-only filter dropping a
result whose title (normalized) is just the searched genre — wired into
`parseGenreSearchResponse` (commit dc1a9f1). Deliberately doesn't touch
`primaryGenreName` matching, so override-dependent genres are unaffected.

## [2026-09-01] Reveal screen showed inverted mismatch results

`isMismatch()` in `lib/taste-test.ts` had both comparison operators flipped:
it returned true when a disliked-genre track was rated <= 2 and when a
liked-genre track was rated >= 4 — the opposite of a mismatch.

Effect: the app built and ran normally, but the reveal screen inverted its
verdict. Tracks I rated in line with my stated genre preferences were flagged
as surprises, and the genuine surprises were shown as expected results. No
crash, no error, no visible symptom until you actually read the results and
noticed they made no sense.

Repro: pick a genre as "liked", rate one of its tracks 5, go to the reveal
screen — it reports a mismatch.

Fix: restored the operators to `disliked && rating >= 4` and
`liked && rating <= 2` (commit 95b9724).
