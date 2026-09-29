# Blind Spot Test

**Goal:** A Play-tab mode that measures the gap between the genres you say
you'd never listen to and what you actually like blind. It delivers the
proposal's "gap reveal" deliverable.

## Flow (`app/blind-test.tsx`, full screen, three phases)

1. **Pick your nevers.** Chips for every genre in the game pool. Pick 1–3, then **Start**.
2. **Ten blind cards.** 5 songs come from the chosen genres (spread across them round-robin) and 5 come from other genres (distinct genres where possible). Artists are distinct and the order is shuffled. It uses the same `CardStack` as Home: right = like, left = skip, down off, hold = pause. The top card autoplays.
3. **Result card.**
   - Headline: "You said never {A}[, {B} & {C}]. You liked {n} of 5 blind."
   - Comparison: "…and {m} of 5 of everything else."
   - Verdict: n ≥ m → "Your blind spot is real." / n < m → "Fair, your ears agree with you."
   - Under that: the 10 songs revealed (artwork, title, artist, genre, count, ♥/✕). Tapping a song plays it.
   - Share (text): `My Blindspot: said never {A}, liked {n}/5 blind 👀`.
   - Buttons: Retake · Done.

## Data

- **Songs:** from `useGamePool` (bundled catalogs, offline).
- **Likes:** each like goes to Liked via `appendLikedTrack`, with `artistListeners` (the seed count) and `likedAt`. Ids come from a stable hash of artist and title, since pool songs have no iTunes id.
- **Last result:** stored in `blindspotDiscovery:blindTest` as `{ never: string[]; neverLiked: number; otherLiked: number; at: number }`. The Play card shows "{A}: {n}/5 · Retake".

## Code

- `lib/blind-test.ts` (pure, tested):
  - `pickTestSongs(pool, never, rng)` returns `{ song, isNever }[]` of length 10, or `[]` if either half can't be filled
  - `scoreTest(items, liked: boolean[])` returns `{ neverLiked, otherLiked }`
  - `testHeadline(never, neverLiked)`, `testComparison(otherLiked)`, `testVerdict(neverLiked, otherLiked)`, `testShareText(never, neverLiked)`
- Storage helpers `loadBlindTest` / `saveBlindTest`. Route registered as a `fullScreenModal`. An entry card is added to the Play tab (second, after the Daily Drop).

## Tasks

1. Write `lib/blind-test.ts` and its tests (RED → GREEN).
2. Storage helpers, the route, the screen, and the Play card. Verify with tsc, lint (baseline of 4), the suite, and a web export.
