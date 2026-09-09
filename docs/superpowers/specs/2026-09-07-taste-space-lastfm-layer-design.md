# Taste Space: a Last.fm Data Layer to Replace the Neutral Stub

**Goal:** `docs/superpowers/specs/2026-09-07-taste-space-design.md` ships the pad, the
persistence, and a fully real `scoreTrack`/`sampleByTasteSpace`, deliberately behind a
stub (`neutralScoreInputSource`) because neither axis's input — a track's popularity
relative to its own artist's biggest track, and how broadly known the artist is —
exists in the iTunes Search API response. Last.fm's API has both, under
`artist.getInfo`, `artist.getTopTracks`, and `track.getInfo`. This spec designs the
layer that calls those endpoints, caches the results, and builds a real
`ScoreInputSource` from them — **spec only, no implementation.**

**Scope:** a new `lib/lastfm.ts`, two new `AsyncStorage` key families in
`lib/discovery-storage.ts`, a small required amendment to `refillQueue`'s wiring in
`lib/discovery.ts` (beyond what the original spec wrote), and the `index.tsx`
call-site wiring that binds the two together. No changes to `scoreTrack`,
`sampleByTasteSpace`'s sampling algorithm, the pad UI, or persistence of
`TasteSpacePosition` — all of that is already correct and untouched.

## Two live checks to run before writing any of this

> **Status as of 2026-09-08: both still outstanding, blocked on credentials.**
> Attempted this session and could not be run. There is no Last.fm API key
> anywhere in this project — not in `app.json` (`expo.extra`), `eas.json`, a
> `.env`, or the shell environment — and every `ws.audioscrobbler.com/2.0/`
> method requires one: an unkeyed request returns
> `HTTP 403 {"message":"Invalid API key ...","error":10}`. The endpoint itself is
> reachable and up, so this is purely a credentials gap, not a connectivity one.
> Neither check can produce a number until a key exists, in any runtime — and
> Check 1 additionally has to run from inside the app (Expo Go / `npm run web`),
> which needs throwaway probe code that this spec-only pass deliberately does not
> write. **Do not treat the numbers in this doc's budget and normalization
> sections as measured until these two checks have actually reported.**


Both are prerequisites, not nice-to-haves — each gates a real fork in the design
below, the same way `docs/superpowers/specs/2026-09-05-region-storefront-design.md`'s
"offset: dead" and "divergence is a property of the pairing" findings gated *that*
design instead of being assumed from documentation.

### Check 1 — does Last.fm answer a browser fetch at all?

This app ships to iOS, Android, *and* web (`npm run web`; the `.ios.tsx`/`.web.tsx`
split in `components/ui/icon-symbol.tsx` exists precisely because platform behavior
already diverges here). iTunes's Search API has never shown a CORS problem from web.
Last.fm's REST API (`ws.audioscrobbler.com/2.0`) has no documented CORS policy and a
mixed reputation for it. This has to be checked from an actual browser tab's
`fetch()` — a `curl` 200 proves nothing, since `curl` doesn't enforce CORS at all; the
check that matters is whether devtools shows a resolved response or a blocked
cross-origin error.

**Gates:** if blocked on web, this layer needs a `lib/lastfm.web.ts` that's a
constant `async () => neutralScoreInputSource` — the same platform-file pattern
`icon-symbol.tsx` already uses — rather than a shared implementation. That changes
the "Files touched" table below, so it has to be known first, not discovered
mid-build.

### Check 2 — do listener counts actually spread at the low end?

The whole left half of the pad (deep cuts, uncharted) is where correction #2 below
says most of this layer's request budget goes. If `track.getInfo` listener counts for
genuinely obscure tracks cluster near a floor — most deep cuts reading as, say,
"11 listeners" vs. "8 listeners," real numbers but statistically indistinguishable —
then the expensive per-track lookups this spec budgets for buy a coin flip on the
X axis, not a signal.

**Method:** pull a real batch or two via `fetchTracksByGenre` (reuse actual `GENRES`
terms, not synthetic data), identify tracks outside their artist's Last.fm top 50 (real
deep cuts, by this design's own definition below), and look at the spread of
`track.getInfo` listener counts across enough of them to see a distribution — a table
like the region doc's five-pairing overlap table, not one anecdote.

**Gates:** whether `relativePopularity`'s raw listener ratio is usable as-is, or needs
a floor/log transform before it means anything at the low end — see "Reach
normalization" below, which has the identical open question for the Y axis and is
deliberately left pending the same finding.

## API surface and units: listeners, not playcount, on both axes

`artist.getTopTracks` returns each track with a `playcount` — total plays, repeats
included. `track.getInfo` (called per-track) returns `listeners` — distinct people.
These are different quantities. The original design's two axes — X (relative
popularity) and Y (reach) — must both be built from **listeners**, never playcount:
mixing them, even accidentally (X from one call's field, Y from another's), puts the
two axes in different units and makes "distance from target" in `scoreTrack`
meaningless, since it's computed after both inputs are assumed to already be
comparable [0,1] quantities. Concretely:

- **Y (reach)** — `artist.getInfo(artist).stats.listeners`. One call per artist,
  independent of any track.
- **X (relativePopularity)** — a track's own `track.getInfo(...).stats.listeners`,
  divided by the artist's biggest track's `track.getInfo(...).stats.listeners`. Two
  listener values, same field, same call, both from `track.getInfo` — never `playcount`
  from `getTopTracks` for either side of that ratio.

`artist.getTopTracks(artist, limit=50)` is still called, once per artist — but only
to find *which* track is "the artist's biggest track" (its rank-0 entry) and to
establish the top-50 set used below. Its `playcount` field is never read into a score.

**Why not use `getTopTracks`' playcount rank as a shortcut for tracks inside the top
50** (skip their `track.getInfo` call, use rank position or playcount ratio instead):
this would put top-50 tracks and deep-cut tracks through two different formulas on
the *same* axis — exactly the mixed-units bug the correction above is about, just
moved one level down. Rejected for the same reason `sampleByTasteSpace` rejected a
sort in the original spec: it would be true of the code and false of the outcome.
Every scored candidate's `relativePopularity` is a listeners ratio, unconditionally.

### Identity is name-based, not ID-based — a real source of misses

Last.fm's API takes `artist`/`track` name strings; it knows nothing of iTunes's
numeric `artistId`/`id`. Lookups go out by `track.artistName`/`trackName` (with
Last.fm's `autocorrect=1` to absorb minor spelling variants), and results are cached
back against iTunes's `artistId`/`id` — the identity space every other cache and
dedup in this codebase already uses (`seenTrackIds`, `spreadByAlbum`'s
`collectionId`, etc.). A name Last.fm can't resolve at all (`error: 6, "artist not
found"`) is not a bug to retry aggressively — it's cached as a negative result (see
below) and treated exactly like a timeout: falls back to neutral for that
artist/track. This is expected steady-state, not an edge case — mistagged genres,
missing "feat." credits, and remix/live-version suffixes all produce it routinely.

## Two-tier caching: one side converges, the other doesn't

**`ArtistStats`** — keyed by iTunes `artistId`, one entry ever needed per artist
(subject to staleness), and reused across every genre, strategy, and session on the
device, forever:

```ts
export type ArtistStats =
  | {
      status: 'found';
      artistId: number;
      lastFmName: string; // Last.fm's resolved (possibly autocorrected) name — kept for debugging mismatches
      reachListeners: number; // artist.getInfo listeners, raw — not yet pool-normalized
      topTrackName: string; // getTopTracks[0].name
      topTrackListeners: number; // track.getInfo(topTrackName).listeners — the X-axis denominator
      fetchedAt: number;
    }
  | { status: 'not-found'; artistId: number; fetchedAt: number }; // negative cache — see below
```

**`TrackListeners`** — keyed by iTunes `trackId`:

```ts
export type TrackListeners =
  | { status: 'found'; trackId: number; listeners: number; fetchedAt: number }
  | { status: 'not-found'; trackId: number; fetchedAt: number };
```

The asymmetry that actually drives the budget conversation below: an artist has
*exactly one* top-50 list, and it's the same 50 tracks every time that artist is
encountered again, from any genre, any session — so `ArtistStats` and the top-50
tracks' own `TrackListeners` entries both converge toward fully cached the more the
app gets used. A **deep cut** — by this design's own definition, any candidate track
not in its artist's top-50 list — has no such bound: the tail of an artist's catalog
is arbitrarily large, and a given device is unlikely to draw the *same* deep cut twice
soon enough for its single `TrackListeners` entry to matter. Its cache entry, once
written, is real and will save a call on a future repeat — it just won't have a
future repeat often. Being "in the top 50" never skips a `track.getInfo` call (every
scored candidate gets one, per the "no shortcut" decision above); it only predicts
whether that call was probably already paid for by someone else's earlier session.

**Negative-cache TTL is shorter than a positive one** — Last.fm's catalog for an
obscure artist can grow between checks — but it still exists, specifically so a
persistently-unresolvable artist doesn't get re-queried every single refill cycle it
happens to reappear in.

### Persistence (`lib/discovery-storage.ts`)

```
blindspotDiscovery:artistStats:<artistId>    → JSON ArtistStats
blindspotDiscovery:trackListeners:<trackId>  → JSON TrackListeners
```

Per-entry keys, not one blob — a departure from `discoveredGenres`/`likedTracks`'s
"load the whole array, mutate, save the whole array" precedent, because the access
pattern here is different in kind: those are always read and written as one small
list; this layer needs to read *many distinct, unpredictable IDs at once* (every
artist in a fresh 200-track batch) and only ever write the ones that were actually
missing. `AsyncStorage.multiGet(keys)` / `multiSet(pairs)` are the primitives that fit
that shape — new to this codebase, but new because this is a new access pattern, not
a stylistic departure. Same best-effort convention as everything else in this file:
a read/write failure is swallowed and treated as a cache miss, never thrown.

## Lookup scope and timing: enrich the whole pool, bound the wait, never block a card

**Scope, per correction:** every distinct `artistId` in a fresh iTunes batch — the
full `pool` `refillQueue` accumulates before `spreadByAlbum`/`sampleByTasteSpace` — is
in scope for enrichment, *before* any selection happens. This isn't "the top few
likely candidates"; `sampleByTasteSpace` weighs the entire pool (only 3 of which end
up queued after `spreadByAlbum`'s slice), so every pool track needs real
`ScoreInputs` to be weighed honestly, not just the ones that end up chosen.

**Timing:** `scoreTrack`/`sampleByTasteSpace` stay synchronous and pure, unchanged
from the original spec — a `ScoreInputSource` is still a plain
`(track: DiscoveryTrack) => ScoreInputs` function. What's new is a builder that does
all of a pool's network work up front and hands back a synchronous closure:

```ts
export async function buildLastFmScoreInputSource(
  pool: DiscoveryTrack[],
  opts?: { budgetMs?: number } // default TBD at implementation, ballpark 1500ms — see budget below
): Promise<ScoreInputSource>;
```

Steps:

1. Dedupe `pool` to distinct `artistId`s; `multiGet` their `ArtistStats` cache keys.
2. For cache misses (and expired positive/negative entries), fetch live — concurrency
   capped (a handful in flight at once; Last.fm has no published hard limit but
   developer consensus is to stay well under a handful of requests/second per key,
   with backoff on non-2xx), each attempt independently timed out.
3. Only for artists that resolved this cycle (cache hit or fresh fetch), fetch
   `TrackListeners` the same cache-first way for whichever of *their* pool tracks are
   candidates — no point spending a call on a track's own listeners when its artist's
   denominator is unknown; the ratio falls back to neutral either way.
4. The whole miss-filling pass races a wall-clock **budget**, not a call count. Every
   AsyncStorage read is local and fast — no need to budget those. Whatever resolves
   before the deadline gets used, *and* is written back via `multiSet` so it's warm
   next time. Whatever's still in flight at the deadline is dropped from this cycle's
   scoring (that artist/track just reads neutral this time) but is **not aborted** —
   it keeps running and still populates the cache on completion, purely for next
   cycle's benefit. This is what makes "unenriched falls back to neutral" and "budget
   for the common case" the same mechanism rather than two separate ones: the budget
   wall decides how much of a cycle's *scope* actually resolves in time, not whether
   scope is correctly defined.
5. Raw `reachListeners` for artists that did resolve are pool-normalized (below) into
   `[0,1]`; a missing entry (never resolved, or Last.fm doesn't have the artist)
   defaults its track's `reach` to `0.5` — not `0`, so an unknown artist never falsely
   reads as niche.
6. Returns the closure:

```ts
return (track: DiscoveryTrack): ScoreInputs => {
  const artist = artistById.get(track.artistId);
  const reach = normalizedReach.get(track.artistId) ?? 0.5;
  const listeners = trackListenersById.get(track.id);
  const relativePopularity =
    artist?.status === 'found' && listeners?.status === 'found' && artist.topTrackListeners > 0
      ? Math.min(1, listeners.listeners / artist.topTrackListeners) // clamp: cache can be stale enough for a candidate to have overtaken the cached "biggest track" since
      : 0.5;
  return { relativePopularity, reach };
};
```

### Budget: deep cuts are the dominant cost, sized honestly

A fresh genre pull is up to `ITUNES_MAX_LIMIT` (200) tracks, commonly spanning on the
order of a hundred-plus distinct artists (genre-dependent — confirm the real
distribution alongside Check 2 above, the same way the region doc measured real
distinct-artist counts rather than assuming them). Fully cold cache, worst case:

- Artist-level: up to ~150 distinct artists × up to 3 calls each (`getInfo` +
  `getTopTracks` + one `getInfo` on the rank-0 track) ≈ **450 calls**.
- Track-level: every one of up to 200 pool tracks needs its own `track.getInfo`
  (no top-50 shortcut, per the "no shortcut" decision above) ≈ **200 calls**.

That's the *scope* correction #2 is about — not a rare fallback path, the standing
cost of scoring a large, deep-cut-heavy pool. The wall-clock budget in step 4 is what
actually keeps this from stalling a refill: at, say, 5 concurrent requests and a
1.5s budget, only on the order of a few dozen lookups complete before the deadline,
meaning **most of a large, cold-cache pool scores as neutral on its first pass** —
the bias this layer adds is real but weak until repeated exposure to the same
artists/tracks warms the cache across sessions. That's an accepted, explicit
trade-off of this design, not a bug to silently paper over: it degrades to "mostly
the old unweighted behavior" under load instead of stalling, and strengthens on its
own the more the app is used.

## Reach normalizes within the current genre pool, not globally

`ArtistStats.reachListeners` is a raw, global number — and raw numbers compare
terribly across genres. **Amapiano artists' Last.fm listener counts run roughly an
order of magnitude below rock/pop acts, even at the very top of their own scene.**

**That gap is a Last.fm population artifact, not obscurity.** Last.fm's scrobbling
userbase is heavily Anglophone/Western and heavily rock/electronic; a genre whose
audience mostly doesn't scrobble reads as small there no matter how large it
actually is in its own market. An amapiano artist at the top of the South African
scene is not a niche artist — they are a broad-reach artist measured on an
instrument that barely points at their audience. Treating that raw number as
"reach" would tell a user browsing amapiano that their entire genre is uncharted,
which is false about the music and useless as a control. This is the single most
important reason reach is pool-normalized rather than thresholded, and it must not
be optimized away into a global scale later: a global scale doesn't just lose
resolution here, it reports the wrong answer. (Same genre where
`docs/superpowers/specs/2026-09-05-region-storefront-design.md` already found the US
storefront's "Amapiano" results mostly mistagged, with ZA's 41-of-45-artist-distinct
catalog essentially invisible from a US-anchored global scale — the same distortion
showing up in a second, independent measurement.) A fixed global threshold for
"niche" vs. "broad" would make an entire strategy's pool read as uniformly niche
regardless of target position — not what "reach" is supposed to mean for someone
actually browsing that genre.

So `reach` is normalized against only the artists actually resolved **within this
`refillQueue` call's `pool`** — i.e., within the current strategy (one genre, or one
artist-jump), recomputed fresh every call, never carried over or blended across
strategies:

- Min-max (or log-then-min-max — pending Check 2's finding on how skewed real
  listener counts are at the low end; a straight linear min-max on a power-law
  distribution risks flattening everything but the single top artist toward 0) across
  the resolved artists' raw `reachListeners` in this pool.
- Degenerate case (0 or 1 distinct resolved artist, or every resolved artist has
  identical `reachListeners`): no discriminating signal exists, so every artist gets
  `reach = 0.5` rather than a divide-by-zero or an arbitrary tie-break — the same
  "nothing to spend a distinction on" idiom the original spec's equal-weights branch
  already uses for the same underlying reason.

## A required amendment to the original spec's wiring: Mixed must stay a hard bypass

The original spec's hard requirement #1 — Mixed is byte-identical to today's
feed — held automatically under the stub, because `neutralScoreInputSource` gives
every candidate the exact same `ScoreInputs`, so `sampleByTasteSpace`'s equal-weights
branch fires at *every* target position, Mixed included (the original spec says this
explicitly). Once a real, non-uniform source exists, that stops being true: two
tracks with genuinely different `relativePopularity`/`reach` generally sit at
different distances from Mixed's target `(0, 0)` too, so `scoreTrack` gives them
different weights at Mixed exactly as it would anywhere else, and the equal-weights
branch simply won't fire there anymore. Requirement #1 has no "under the stub"
qualifier — unlike requirement #3, which is explicit that it only claims inertness
under the neutral stub — so it's meant to survive this change, and now needs an
explicit mechanism instead of an emergent one.

**Fix:** `refillQueue` bypasses sampling entirely at Mixed, regardless of which
source is wired in — Mixed means "no bias," not "whatever a real landscape's center
happens to compute":

```ts
function isMixedPosition(p: TasteSpacePosition): boolean {
  return p.x === 0 && p.y === 0; // by value — a loaded/round-tripped position is never the same object as MIXED_POSITION
}

export async function refillQueue(
  queue: DiscoveryTrack[],
  strategy: Strategy,
  seenTrackIds: Set<number>,
  fetcher: (strategy: Strategy) => Promise<DiscoveryTrack[]>,
  recentAlbumIds: (number | undefined)[] = [],
  tasteSpacePosition: TasteSpacePosition = MIXED_POSITION,
  buildScoreInputSource: (pool: DiscoveryTrack[]) => Promise<ScoreInputSource> = async () => neutralScoreInputSource
): Promise<RefillResult> {
  // ...unchanged fetch loop...
  if (pool.length > 0) {
    const windowSoFar = [...recentAlbumIds, ...result.map((t) => t.collectionId)];
    const sampled = isMixedPosition(tasteSpacePosition)
      ? pool
      : sampleByTasteSpace(pool, tasteSpacePosition, await buildScoreInputSource(pool));
    result = [...result, ...spreadByAlbum(sampled, windowSoFar)].slice(0, QUEUE_TARGET_DEPTH);
  }
  return { queue: result, fetched };
}
```

This also means `buildScoreInputSource` — and every Last.fm call it would trigger —
is never even invoked while the dial sits at Mixed, which is the default: no network
cost is paid for taste-space at all until the user actually moves off center.
`refillQueueWithFallback` threads `buildScoreInputSource` through exactly as it
already threads `tasteSpacePosition`.

`lib/discovery.ts` gains no import of `lib/lastfm.ts` — `buildScoreInputSource` is
injected the same way `fetcher` already is, so the core queue engine stays ignorant
of which vendor (or stub) backs it, mirroring how region binds a storefront-specific
closure at the call site rather than teaching `refillQueue` about storefronts.

## `app/(tabs)/index.tsx` wiring

Mirrors the region-toggle precedent's fetcher-closure pattern:

```ts
await refillQueueWithFallback(
  baseQueue,
  activeStrategy,
  history,
  knownGenres,
  GENRES,
  (strategy) => fetchForStrategy(strategy, activeRegion),
  recentAlbumIds,
  tasteSpacePosition,
  (pool) => buildLastFmScoreInputSource(pool)
);
```

No new component-level state beyond what the original spec already added
(`tasteSpacePosition`); this only changes what gets passed alongside it.

## Testing

- `lib/lastfm.test.ts` (new): response parsing for each of the three endpoints
  (including the "artist/track not found" error shape) is pure and testable without
  network, same as `parseGenreSearchResponse`/`parseArtistLookupResponse` today.
  `buildLastFmScoreInputSource` itself is tested against an injectable fetch
  function (same DI precedent `refillQueue` already sets for `fetcher`), covering:
  cache-hit-only (zero network calls), cache-miss-resolves-in-time, cache-miss-hits-
  the-budget-wall (falls back to neutral, but the in-flight promise still resolves
  into the cache afterward), and negative-cache (a "not found" artist is not
  re-fetched on a second pool within its TTL).
- Reach normalization: min-max over a fixed set of resolved values; the degenerate
  (0/1 distinct artist, or all-equal) case returns `0.5` for all, not a NaN or an
  arbitrary order-dependent tie-break.
- `lib/discovery.test.ts`: one new test confirms `isMixedPosition(tasteSpacePosition)`
  skips `buildScoreInputSource` entirely at `MIXED_POSITION` even when a source that
  would obviously bias the result is injected — the test that would fail if
  requirement #1's bypass were ever accidentally removed as "redundant" once real
  data made it look unnecessary in the common case.

## Out of scope

- Actually running the two live checks above, or picking their resulting numeric
  constants (`budgetMs`, concurrency cap, TTLs, the exact normalization transform) —
  this spec designs the mechanism each decision plugs into, not the decision itself.
- A server-side proxy for Last.fm, even if Check 1 finds web blocked — the immediate
  fallback there is the `.web.tsx`-style neutral no-op, not a new backend.
- Any UI surfacing of enrichment state ("loading real data…", cache-hit indicators) —
  the original spec already ruled out any "is this inert?" messaging for the stub;
  this doesn't reopen that for the real layer either.
- Retrying or backfilling a "not-found" negative cache entry proactively — it only
  ever gets re-tried the next time that artist naturally comes up again post-TTL.
- Any change to `scoreTrack`, `sampleByTasteSpace`'s algorithm, the pad UI, or
  `TasteSpacePosition` persistence — all already correct per the original spec.

## Files touched

| File | Change |
|---|---|
| `lib/lastfm.ts` | New — endpoint calls, response parsing, `ArtistStats`/`TrackListeners` types, `buildLastFmScoreInputSource` |
| `lib/lastfm.web.ts` | New, only if Check 1 finds web blocked — constant neutral fallback |
| `lib/lastfm.test.ts` | New |
| `lib/discovery-storage.ts` | New `artistStats`/`trackListeners` `multiGet`/`multiSet`-based cache functions |
| `lib/discovery.ts` | `refillQueue`/`refillQueueWithFallback` gain a defaulted `buildScoreInputSource` param; explicit `isMixedPosition` bypass added around the sampling call the original spec wrote |
| `lib/discovery.test.ts` | One new test (Mixed bypass under a biased injected source); no existing test modified |
| `app/(tabs)/index.tsx` | Binds `buildLastFmScoreInputSource` into the `refillQueueWithFallback` call, alongside the existing region-bound fetcher |

---

Supersedes nothing in `2026-09-07-taste-space-design.md` — extends its
`ScoreInputSource` section and makes one required amendment to its `refillQueue`
wiring code (the Mixed bypass above), called out explicitly rather than silently
overwritten.
