# Taste Space

> **Status as of 2026-09-08: blocked on the candidate source, not on Last.fm.**
> A live probe from the app runtime (Expo Go, not node) confirmed Last.fm answers
> cleanly — every call HTTP 200 — so the concern raised in
> `2026-09-07-taste-space-lastfm-layer-design.md`'s "Check 1" (web CORS) is
> resolved for at least this runtime. But the same probe (rock/US, 25 tracks) found
> 24 of 25 were top-50 hits by major artists: the iTunes Search pool this spec's
> pipeline draws from occupies only the Hits corner. There are no deep cuts on the
> X axis to draw from, and Y is compressed at the high-reach end. Last.fm can score
> whatever candidates arrive; it has nothing to say about a pipeline that never
> fetches a candidate belonging anywhere else on the pad. **Open question, not a
> plan:** invert the pipeline so `artist.getTopTracks` (or a similar Last.fm
> catalogue call) supplies deep-cut/niche candidates, and iTunes Search is used
> only to resolve preview URLs/artwork for whatever Last.fm names — the reverse of
> today's "iTunes finds candidates, Last.fm scores them" direction. Not designed
> here; flagging that the candidate-sourcing problem is likely the harder half of
> this feature, not the scoring half this spec and the Last.fm layer spec already
> cover.

A third tab, `app/(tabs)/taste-space.tsx`, giving the user a 2D control over
what kind of track gets sampled into the discovery queue:

- **Y axis** — artist reach: how broadly known the artist is (bottom = niche,
  top = broad).
- **X axis** — the track's popularity relative to its own artist's biggest
  track (left = deep cut, right = that artist's biggest track).
- **Corners**, labelled and tap-to-snap: **Hits** (top-right — a broad
  artist's biggest track), **Deep cuts** (top-left — a broad artist's
  obscure track), **Breakouts** (bottom-right — a niche artist's biggest
  track), **Uncharted** (bottom-left — a niche artist's obscure track).
  **Mixed** is the center and the default.
- The dot is draggable anywhere within the pad, in addition to the four
  corner taps.

**The problem this runs into immediately:** the iTunes Search API has
neither a popularity field nor an artist fan-count field. Both axes'
real inputs don't exist yet. Everything in this spec — the tab, the pad,
persistence, the plumbing into `refillQueue` — is built and tested now
regardless, behind an interface (`ScoreInputSource`) whose only
implementation today is a stub returning a fixed neutral value. Swapping in
a real data source later is the only thing this spec doesn't do.

## Hard requirements

1. With the control at Mixed (the default), feed behavior is byte-identical
   to today's. Existing tests pass unchanged — none are modified.
2. Taste Space biases sampling; it never filters. Every fetched, unseen
   track remains reachable at every target position.
3. **Under the neutral stub, Taste Space is provably inert, not inert in
   expectation.** This is an explicit invariant of the design, not an
   incidental consequence of the stub's current values — see "Why a
   deterministic sort was rejected" below. It must survive future
   refactoring: nothing may replace the equal-weights short-circuit
   described there with logic that is merely *usually* a no-op (e.g. relying
   on a fixed random seed, or on the neutral values happening not to move
   the result today). If a future change makes this only statistically
   true, that change violates this spec even if `scoreTrack` itself is
   untouched.

## `lib/taste-space.ts` (new module)

Self-contained, mirroring `lib/taste-test.ts`'s precedent (types,
persistence, and logic together in one file) rather than the
`discovery.ts`/`discovery-storage.ts` split — this is a small, independent
concern, not an extension of the discovery engine's own state.

```ts
export type TasteSpacePosition = { x: number; y: number }; // each in [-1, 1]
export const MIXED_POSITION: TasteSpacePosition = { x: 0, y: 0 };

export type TasteSpaceCorner = 'hits' | 'deepCuts' | 'breakouts' | 'uncharted';
export const CORNER_POSITIONS: Record<TasteSpaceCorner, TasteSpacePosition> = {
  hits: { x: 1, y: 1 },
  deepCuts: { x: -1, y: 1 },
  breakouts: { x: 1, y: -1 },
  uncharted: { x: -1, y: -1 },
};

// x = track popularity relative to its own artist's biggest track (0 = deep
// cut, 1 = that artist's biggest track). y = artist reach (0 = niche, 1 =
// broad). Neither field exists in the iTunes Search API response today —
// see ScoreInputSource below for the part of this file that's actually a
// stub. This type itself is real: it's what a future real source will
// return, and what scoreTrack's tests already exercise directly.
export type ScoreInputs = { relativePopularity: number; reach: number };
```

### `scoreTrack` — real, not stubbed

```ts
/**
 * Maps ScoreInputs + a target position to a sampling weight, always > 0.
 * Closer to target (in the [-1,1]x[-1,1] space, after remapping inputs'
 * [0,1] range the same way) scores higher. Never 0 — a candidate at the
 * opposite corner from target is merely unlikely to be drawn, never
 * impossible; see sampleByTasteSpace for why that guarantee actually
 * matters given how the weight is consumed.
 */
export function scoreTrack(inputs: ScoreInputs, target: TasteSpacePosition): number;
```

This function is fully real and fully tested today, using fabricated
`ScoreInputs` — it doesn't depend on real data existing, only on real data
not existing *yet*. What's stubbed is strictly the input side:

```ts
export type ScoreInputSource = (track: DiscoveryTrack) => ScoreInputs;

/**
 * The only implementation today. Always returns the same neutral point
 * (0.5, 0.5) regardless of the track — iTunes has neither field this would
 * need. Swapping this for a real source, whenever one exists, is the only
 * change this spec defers.
 */
export const neutralScoreInputSource: ScoreInputSource = () => ({
  relativePopularity: 0.5,
  reach: 0.5,
});
```

### `sampleByTasteSpace` — weighted sampling without replacement, not a sort

**Why a deterministic sort was rejected:** an earlier version of this
design sorted candidates by weight descending. `refillQueue` only ever
consumes the *front* of its ordered candidate pool (it fills to
`QUEUE_TARGET_DEPTH` and stops); a sort therefore means a low-weight track
only surfaces after every higher-weight track in that fetch has been
exhausted via `seenTrackIds` — which given typical usage (frequent
genre-jumps, a target depth of 3) means, in practice, never. `scoreTrack`'s
">0, never impossible" guarantee would be true of the number and false of
the outcome. Requirement 2 above demands the outcome.

```ts
/**
 * Returns a permutation of `candidates`: a weighted random draw without
 * replacement, weight = scoreTrack(source(track), target). Every candidate
 * has a real, nonzero chance of landing anywhere in the result, including
 * first — not just "eventually, once nearer candidates run out."
 *
 * Equal-weights case (see below) aside, implemented via Efraimidis-Spirakis
 * weighted sampling: each candidate gets key = Math.random() ** (1 / weight),
 * sorted descending. This is equivalent in distribution to drawing one
 * candidate at a time with probability proportional to its remaining
 * weight, without the O(n^2) cost of actually removing and redrawing —
 * candidate pools run up to ITUNES_MAX_LIMIT (200), so this matters.
 *
 * INVARIANT (see spec "Hard requirements" #3): if every candidate's weight
 * comes out equal, sampling is skipped entirely and `candidates` is
 * returned in its original (fetch) order — unchanged, deterministically,
 * not "a random permutation that happens to look unchanged." This is the
 * same "preserve original order as the tie-break" idiom spreadByAlbum
 * already uses for its own equal-eligibility ties, applied here for the
 * same reason: a distribution with no discriminating signal has nothing to
 * spend randomness on. Under neutralScoreInputSource, every candidate gets
 * identical ScoreInputs regardless of target, so this branch fires at every
 * target position, not only Mixed — Taste Space is inert everywhere the
 * stub is in effect, which is what makes requirement #1 (Mixed-identical)
 * hold as a special case of something broader and provable, rather than as
 * a fact that only happens to be true at one particular position today.
 *
 * This branch MUST NOT be removed or weakened (e.g. into "usually returns
 * the same order," or gated behind a fixed random seed) as a later
 * simplification — doing so turns requirement #3 from provable back into
 * incidental. If a real ScoreInputSource ever produces exactly-equal
 * weights for a non-neutral reason, this branch still applies correctly:
 * there is genuinely no signal to sample by in that case either.
 */
export function sampleByTasteSpace(
  candidates: DiscoveryTrack[],
  target: TasteSpacePosition,
  source: ScoreInputSource = neutralScoreInputSource
): DiscoveryTrack[];
```

### Persistence (`blindspotDiscovery:tasteSpacePosition`)

Same key prefix and best-effort try/catch convention as
`lib/discovery-storage.ts` and `lib/taste-test.ts` — a read/write failure
falls back to `MIXED_POSITION` / is silently swallowed, never throws.

```ts
export async function loadTasteSpacePosition(): Promise<TasteSpacePosition>; // MIXED_POSITION on missing/corrupt/out-of-range
export async function saveTasteSpacePosition(position: TasteSpacePosition): Promise<void>;
```

`loadTasteSpacePosition` validates both fields are finite numbers in
`[-1, 1]`; anything else (missing key, malformed JSON, out-of-range values
from a hypothetically corrupted write) falls back to `MIXED_POSITION`,
matching `loadRegion`'s "fall back on any unrecognized value, not just a
throw" precedent.

## Wiring into `lib/discovery.ts`

`refillQueue` gains one defaulted parameter, the same pattern
`recentAlbumIds` already established:

```ts
export async function refillQueue(
  queue: DiscoveryTrack[],
  strategy: Strategy,
  seenTrackIds: Set<number>,
  fetcher: (strategy: Strategy) => Promise<DiscoveryTrack[]>,
  recentAlbumIds: (number | undefined)[] = [],
  tasteSpacePosition: TasteSpacePosition = MIXED_POSITION
): Promise<RefillResult> {
  // ...unchanged fetch loop accumulating `pool`...
  if (pool.length > 0) {
    const sampled = sampleByTasteSpace(pool, tasteSpacePosition);
    const windowSoFar = [...recentAlbumIds, ...result.map((t) => t.collectionId)];
    result = [...result, ...spreadByAlbum(sampled, windowSoFar)].slice(0, QUEUE_TARGET_DEPTH);
  }
  return { queue: result, fetched };
}
```

`sampleByTasteSpace` replaces "iTunes's original relevance order" as the
order `spreadByAlbum` receives its candidates in — `spreadByAlbum` itself
is untouched; it still greedily places from whatever order it's handed and
still enforces its own window/cap/tier rules on top. Under the stub, per
the invariant above, `sampled` equals `pool`'s original order exactly, so
this is a no-op composition with today's behavior.

`refillQueueWithFallback` takes the same defaulted parameter and threads
it through every `refillQueue` call it makes, mirroring how it already
threads `recentAlbumIds`.

Every existing call site — every test in `lib/discovery.test.ts`, every
`runRefill` call in `app/(tabs)/index.tsx` today — omits this parameter,
gets `MIXED_POSITION`, and produces output identical to before this
change. **No existing test is modified.**

## `app/(tabs)/index.tsx` wiring

Mirrors the `region` state precedent:

- `tasteSpacePosition` is loaded on mount (alongside `region`) and held in
  state, threaded through `runRefill` → `refillQueueWithFallback`.
- A `useFocusEffect` on the Home screen re-reads the persisted position
  whenever Home regains focus (i.e., on returning from the Taste Space
  tab) and compares it against the in-memory value. On a change, it does
  the same thing `handleToggleRegion` already does: preserve the current
  top card, drop the buffered tail, and refill immediately under the new
  position — per your answer, a position change takes effect as soon as
  you're back on Home, not lazily.
- Not part of `UndoSnapshot` — a standing preference like `region`, not a
  momentary content action; undo doesn't touch it, for the same reason
  `region` is already excluded.

## New tab: `app/(tabs)/taste-space.tsx` + `components/taste-space/`

Third `Tabs.Screen` in `app/(tabs)/_layout.tsx`, title "Taste Space",
icon `"scope"` (SF Symbols) mapped to MaterialIcons `"gps-fixed"` in
`icon-symbol.tsx`'s Android/web mapping — both already-available icon
sets, no new dependency.

**`components/taste-space/taste-space-pad.tsx`** — a square `ThemedView`
with the four corner labels pinned to its corners and "Mixed" centered
faintly behind the dot's rest position. The dot uses the same
`react-native-gesture-handler` `Gesture.Pan()` + `react-native-reanimated`
`useSharedValue` pattern `SwipeCard` already uses for continuous drag
tracking — clamped to the pad's bounds, not the fly-out/spring-to-edge
physics `SwipeCard` uses for commits. Tapping a corner label snaps the dot
there (`withSpring`). Every settled position (drag release or corner tap)
calls `onChange(position: TasteSpacePosition)`.

**`components/taste-space/taste-space-pad-geometry.ts`** — pure, testable
geometry pulled out of the gesture component, mirroring the
`swipe-physics.ts`/`swipe-card.tsx` split: clamping a raw drag translation
to `[-1,1]x[-1,1]` pad space, and resolving a tap point to its nearest
corner. Domain concerns (position type, persistence, scoring) stay in
`lib/taste-space.ts` per this module's original scope; pad-local
pixel/gesture math doesn't belong there, same separation the discovery
card already establishes.

## Testing

**`lib/taste-space.test.ts`** (new — run via
`node --experimental-strip-types --test`, same as `discovery.test.ts`):

- `scoreTrack`: closer-to-target inputs score higher than farther ones;
  weight is always `> 0` even at the corner opposite target; behavior is
  symmetric across corners (no axis or corner is special-cased in the
  implementation).
- `sampleByTasteSpace`:
  - **Equal-weights invariant:** with `neutralScoreInputSource` (or any
    source producing equal weights across the pool), output order exactly
    equals input order — checked at multiple target positions, not just
    `MIXED_POSITION`, since the invariant claims it holds everywhere the
    stub is active, not only at the default.
  - **Reachability, not sort:** with a custom `ScoreInputSource` giving one
    candidate a much lower weight than the rest, run `sampleByTasteSpace`
    a large fixed number of times (weight ratio and trial count chosen so
    the false-negative probability is astronomically small — worked out
    below, not just "usually passes") and assert the low-weight candidate
    lands in the first position at least once across the runs. This is the
    test that directly falsifies the rejected deterministic-sort design:
    it would fail against that version, since a sort never lets the lowest
    ranked candidate reach the front.
  - A normal (non-degenerate) case confirms every candidate still appears
    exactly once in the output — a permutation, nothing dropped or
    duplicated, regardless of weight.
- `neutralScoreInputSource`: returns the same fixed value regardless of
  the track passed in.
- Persistence: load with nothing saved returns `MIXED_POSITION`;
  malformed JSON, non-object values, and out-of-range coordinates each
  fall back to `MIXED_POSITION`; save-then-load round-trips a real
  position.

**Reachability test sizing:** with candidate weights `w_low` and `w_high`
(three `w_high` candidates, one `w_low`), the Efraimidis-Spirakis draw's
probability of the low-weight candidate landing first is approximately
`w_low / (w_low + 3 * w_high)`. Choosing inputs so this works out to
roughly `0.1` and running `500` trials gives a false-negative probability
of `0.9^500 ≈ 1.3e-23` — the test asserts "count > 0," so this is the
probability of a spurious CI failure. Exact `ScoreInputs`/target values
implementing this ratio are chosen during implementation, not fixed here.

**`lib/discovery.test.ts`**: extended, not rewritten. One new test calls
`refillQueue`/`refillQueueWithFallback` with an explicit non-Mixed
`tasteSpacePosition` and a pool where `spreadByAlbum`'s tiers leave more
than one valid placement, confirming the sampling pass actually ran
(output order differs from a call with `MIXED_POSITION` across repeated
runs, statistically). **Every existing test in this file is unchanged.**

**`components/taste-space/taste-space-pad-geometry.test.ts`**: pure
functions only (clamp-to-pad-bounds, nearest-corner resolution), same
style as `swipe-physics.test.ts`. No test for the gesture component
itself (`taste-space-pad.tsx`) — matches existing precedent
(`swipe-card.tsx` has none either).

## Control precedence

Taste Space is the fourth control that shapes the queue, alongside steering
(`2026-09-05-always-available-steering-design.md`), the genre picker, and the
region toggle (`2026-09-05-region-storefront-design.md`). This section fixes what
happens when they disagree.

Rules 1 and 2 describe controls that already exist and need no code change. Rules
3–5 land on the weighted-sampling design above, and two of them do not fit it
cleanly — that is called out in place rather than papered over.

### 1. Steering always wins; the graph re-applies on the next natural pull

"More from this artist" / "More like this sound" beats the graph position
unconditionally. A steer sets `strategy` — *which* pool is fetched. The graph is a
preference applied *within* whatever that strategy returns. When the two conflict
(a steered artist whose catalogue sits nowhere near the selected quadrant), the
steer is honoured and the graph bends to it. The graph can never override, dilute,
or partially ignore a steer; there is no blending.

The graph re-applies on the **next natural queue pull** — the refill the steer
itself triggers, and every refill after it — not immediately, and never
retroactively. `applySteeringStrategy` already preserves the currently-showing card
(`queue.slice(0, 1)`) and drops the buffered tail; the graph takes effect on the
tracks fetched to replace that tail. This is the steering spec's own rule
("steering only changes what gets fetched for subsequent cards") extended to the
graph: no control reaches backwards into a card already committed to the screen.

Note this is not a *delay*. The position-change path in the `index.tsx` wiring
above already drops the buffered tail and refills on returning to Home; a steer
refills too. Both leave the current card alone. "Not immediately" means "not
retroactively" — there is no pending-graph state to track, and no case where a
position change sits queued waiting for something else to happen first.

### 2. Genre picker and region are hard filters; the graph is a preference

The genre picker and the region toggle decide the pool: which search term goes out,
and which storefront answers it. Both are absolute. The graph can never surface a
track from an unselected genre or an unselected storefront at any position, for the
simple reason that such a track was never fetched — the filter applies at the
network boundary, upstream of everything in this spec.

The graph is a preference over whatever those two leave behind. The consequence is
worth stating plainly, because it will look like a bug otherwise: **a quadrant is
only as reachable as the current genre+region pool makes it.** "Hits" inside a
genre+region whose catalogue is uniformly obscure returns that pool's
broadest-reach tracks — not globally broad-reach tracks. The corner labels name a
position within the current pool, never an absolute tier.

This is the same reasoning as the pool-local reach normalization in
`2026-09-07-taste-space-lastfm-layer-design.md`, and deliberately so: both axes
mean "relative to what is actually in front of you." A user who wants a different
absolute answer changes the genre or the region — the two controls that are
*designed* to move the pool — not the graph.

### 3. The graph relaxes rather than stalls

**The rule:** if the target quadrant cannot fill the queue, the acceptance window
widens outward from the selected point until it can, rather than returning an empty
stack. Same principle as `spreadByAlbum`'s two-tier fallback in
`2026-09-05-album-spread-design.md`: a constraint that cannot be satisfied gives
way; the queue is never starved to protect it.

**How this lands on the design above — read this before implementing it.**
`sampleByTasteSpace` *cannot* stall, structurally. It is a weighted permutation of
the pool, not a filter: every candidate keeps a nonzero weight (hard requirement
#2), every candidate appears exactly once in the output, and `spreadByAlbum` then
slices `QUEUE_TARGET_DEPTH` off the front of it. The queue fills from whatever the
pool holds, at every target position, including positions no track in the pool is
anywhere near. There is no gate to relax and no empty-stack case to defend against.
The behaviour this rule asks for is already guaranteed — a fortiori, not by
accident.

So the acceptance window is **diagnostic, not a gate.** Reintroducing it as a real
filter — draw only from within radius r, widen r on failure, retry — would
reintroduce exactly the "candidate is unreachable in practice" failure that hard
requirement #2 and the rejected-sort discussion above exist to prevent, and is
explicitly rejected here. Define the window instead as a radius around the target
position, and call a pull **relaxed** when the tracks that actually filled the
queue fell outside that radius because the pool held nothing nearer.

"Widen outward until it fills" is therefore the *measurement*, not a retry loop:
how far out from the selected point do you have to reach to account for what
actually got queued. Nothing is re-drawn, no second pass runs, and the sampling
algorithm above is untouched. What changes is that the distance is now recorded
instead of discarded — which is rule 4.

### 4. A relaxed pull must be observable

A relaxed pull is recorded on the queue entry, so Profile can surface it later and
so it is debuggable now. **It is not surfaced in the card UI** — no badge, no "not
quite what you asked for" caption. That stays consistent with the existing decision
in "Out of scope" below to keep the graph's internal state out of the card.

Recorded at refill time, on the entry, as an optional field — the same
`collectionId` / `listenMs` precedent this codebase already uses for
"populated when known, absent otherwise, no migration":

- On `DiscoveryTrack`: the drawn track's distance from the target position, in the
  same `[-1,1]x[-1,1]` space `scoreTrack` works in, plus the target it was drawn
  against. Set by `refillQueue` when sampling ran, absent when it did not.
- Absent is meaningful and must stay distinguishable from zero: a Mixed-position
  pull, or a pull under the neutral stub, records nothing at all rather than
  recording distance 0. "No graph was applied" and "the graph was applied and got
  an exact hit" are different facts and Profile must not conflate them.
- For Profile to show this *later*, it has to survive the queue: `SwipeEntry` is
  what persists, so the field is copied across at swipe time alongside `trackName`
  / `artistName`, optional for the same reason those are.

The threshold at which a distance counts as "relaxed" is a display concern, not a
storage one — store the distance, let Profile decide what to call it. Storing a
boolean instead would bake one threshold in permanently and throw away the number
that makes it debuggable.

### 5. Tracks with no Last.fm match are never dropped

A track Last.fm cannot resolve is **unplaceable on both axes** — not obscure, not
broad, not a deep cut, simply unmeasured. It passes any graph position rather than
failing all of them. This is expected steady state, not an edge case: the Last.fm
layer spec is explicit that mistagged genres, missing "feat." credits, and
remix/live suffixes produce misses routinely, and that a cold-cache pool scores
mostly unenriched on its first pass.

**Implemented as the neutral `0.5 / 0.5` fallback** the Last.fm layer spec already
specifies for an unresolved artist or track. That keeps the track in the
permutation with a real, nonzero weight at every position — never filtered, never
zero-weighted, reachable anywhere.

One honest caveat, since "passes any position" and `0.5 / 0.5` are not literally
the same thing: a neutral track sits at middling distance from every target, so at
a corner it is out-weighted by a genuine corner match and out-weighs the opposite
corner. It passes everywhere; it wins nowhere.

**The stronger reading — score an unmatched track as if it sat exactly at the
target, so it "passes" at full weight — is rejected.** Under it, unmatched tracks
would outrank every genuinely-matching track at every position; combined with a
cold-cache pool being mostly unmatched, the queue would fill with unplaceable
tracks precisely at the extreme positions where the user is asking hardest for real
signal. That inverts the feature. "Not dropped" is the requirement, and neutral
weighting satisfies it; "always wins" is not the requirement.

## Out of scope

- Actually sourcing `reach`/`relativePopularity` from real data — no such
  iTunes field exists; this is the deferred half of the feature by design.
- Any visual indication that the dial is currently inert (no "coming soon"
  messaging). The control is fully real, just quietly waiting on data — a
  caveat can be added later if it proves confusing in practice.
- Persisting Taste Space position in `UndoSnapshot`.
- **The Profile-side display of relaxed pulls.** Control precedence rule 4 requires
  the distance be *recorded* so Profile can show it later; what Profile actually
  renders, and at what threshold a distance reads as "relaxed", is a separate
  change against `app/(tabs)/explore.tsx` and is not designed here.
- Any card-UI indication that a pull was relaxed — explicitly excluded by rule 4.
- Changing `spreadByAlbum`'s own tie-break/fallback logic — Taste Space
  only changes the order it receives its input in.
- An injectable RNG for `sampleByTasteSpace` — `Math.random()` directly,
  consistent with `shuffle`/`pickJumpGenre`'s existing convention; the
  reachability test is statistical (many draws), not seeded.

## Files touched

| File | Change |
|---|---|
| `lib/taste-space.ts` | New — types, `scoreTrack`, `ScoreInputSource`, `neutralScoreInputSource`, `sampleByTasteSpace`, persistence |
| `lib/taste-space.test.ts` | New |
| `lib/discovery.ts` | `refillQueue`/`refillQueueWithFallback` gain a defaulted `tasteSpacePosition` param; `sampleByTasteSpace` call feeds `spreadByAlbum`; optional relaxation field added to `DiscoveryTrack` and `SwipeEntry` per control-precedence rule 4 |
| `lib/discovery.test.ts` | One new test added; no existing test modified |
| `app/(tabs)/index.tsx` | Load/hold `tasteSpacePosition`; focus-triggered refresh on change, mirroring `region`; copy the relaxation field onto `SwipeEntry` at swipe time |
| `app/(tabs)/_layout.tsx` | Third `Tabs.Screen` |
| `app/(tabs)/taste-space.tsx` | New tab screen |
| `components/taste-space/taste-space-pad.tsx` | New — drag/tap UI |
| `components/taste-space/taste-space-pad-geometry.ts` | New — pure clamp/nearest-corner helpers |
| `components/taste-space/taste-space-pad-geometry.test.ts` | New |
| `components/ui/icon-symbol.tsx` | New `"scope"` → `"gps-fixed"` mapping entry |
