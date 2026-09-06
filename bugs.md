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
