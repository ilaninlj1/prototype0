# Sound Space: Crossing Popularity with Audio Character

**Spec only — no implementation.**

**The pitch.** Pool-steering (shipped) already gives the app one real,
independent dial: how known a track is — artist listeners × the track's
rank within that artist's own catalog (Preset A "Hidden gems" through D
"Buried," `lib/pool.ts`/`lib/pool-config.ts`, unchanged by this spec).
Spotify's recommender can tell you what sounds like what, but it optimizes
for engagement, so "more like this" always hands you someone bigger. This
spec adds a second, independent dial — what a track actually *sounds*
like (tempo, key, loudness, danceability, mood, acoustic-vs-electronic,
vocal-vs-instrumental) — and crosses it with the first. "Slow, dark,
electronic, from someone with 40k listeners" is a request neither Spotify
nor this app's own pool-steering can answer alone. Crossing the two is the
differentiator; neither axis alone is.

**Relationship to the earlier Taste Space specs.** Not a revival.
`2026-09-07-taste-space-design.md`'s two axes were artist reach and
relative track popularity — the same popularity-space pool-steering
already shipped a real, working answer to (Taste Space's own successor
note says as much). Sound Space's axis is a different kind of measurement
entirely — acoustic content, not listener counts — and pairs with
pool-steering's *existing* popularity axis rather than re-deriving it.
Nothing here reopens `neutralScoreInputSource` or the Last.fm
reach-normalization work; that thread is closed.

## Checks to run before building anything

Three, all gating a real fork below — none of the numbers or scope
decisions past this section should be treated as settled until these have
actually reported, the same convention
`2026-09-07-taste-space-lastfm-layer-design.md`'s "Two live checks" section
set.

### Check 0 — the coverage spike (the gate the rest depends on)

**Not the full pipeline.** Take ~50 artists already in `assets/genres.json`
(a real cross-section — some obscure, some popular, spread across a few
genres, not 50 from one healthy genre), run the MusicBrainz recording
lookup + title-match described below, and look up each matched recording
MBID against the AcousticBrainz Genre Dataset. Measure the fraction that
comes back with real features.

**Gate:** 70%+ on the AcousticBrainz-alone number means the two-layer
design below is comfortably viable and Essentia is upside, not load-bearing.
~50% (this spec's working estimate, unmeasured) means Essentia moves from
"second layer" to "the layer that makes this feature viable for most
tracks" — still fine, just a different center of gravity for where the
engineering effort actually goes. Below ~20% on AcousticBrainz *and* a
low Essentia success rate (see Check 1) means look for a different feature
source before building either script.

### Check 1 — does Essentia actually run in this project's environment, on this project's audio?

`essentia.js` existing is not the same fact as "the exact script shape this
codebase uses (`node --experimental-strip-types`, no browser, no Web Audio
API) can load it and decode a real preview clip." Confirmed independently
this session: a real preview URL already on disk
(`assets/catalogs/electronic.json`) is
`.../mzaf_1579525409280725842.plus.aac.p.m4a` — AAC-in-M4A, not a format
every WASM audio pipeline decodes for free outside a browser's native
decoder. Two sub-questions, both real forks:

1. Does `essentia.js`'s Node target decode AAC/M4A directly, or does it
   only accept raw PCM/WAV (common for WASM audio libraries, which often
   push decoding onto whatever browser API surrounds them)? If the latter,
   the pipeline needs an explicit decode step (e.g. shelling out to
   `ffmpeg`, a real new dependency this spec hasn't budgeted for) before
   `MusicExtractor` ever sees the audio.
2. Does `MusicExtractor` run meaningfully faster than real-time on a
   ~30-second clip, on ordinary dev hardware, at the batch sizes precompute
   scripts already run (hundreds of artists)? If it's slow enough to
   dominate the iTunes pacing budget below, that changes the time estimate
   for a full precompute run, not just the mechanism.

**Gate:** if Node-side decode isn't free, the "Files touched" list below
gains an `ffmpeg` (or equivalent) dependency and a decode step between
"download preview" and "run MusicExtractor." If Essentia turns out
impractical in this environment at all, Layer 2 is dropped and Layer 1's
coverage number from Check 0 is the number this feature actually ships
with.

### Check 2 — is the Zenodo dump download-once-and-index, or something spikier

"One JSON per RecordingID" at AcousticBrainz's actual corpus size (millions
of recordings) implies a large one-time download before Check 0 can even
run its 50-artist sample. Confirm whether Zenodo's distribution ships a
lightweight ID index/manifest separate from the full per-recording feature
payloads — if so, Check 0 can test presence against the index alone and
only pull full feature JSON for artists that actually clear the spike. If
no such index exists, Check 0's "just check 50 artists" framing understates
its own cost: it requires provisioning the full dump first, which is a
real infra step (disk space, download time) this spec has not sized.

## The join problem — now four-way, not three

`assets/genres.json` stores an artist-level `mbid` today (verified this
session: 83 of 92 Electronic artists, 90%, carry one — Last.fm's own
`artist.getInfo`/`getTopTracks` responses include it when Last.fm has
resolved the artist, which is most of the time). **That field does not
reach the app**: `lib/pool-types.ts`'s `SeedArtistEntry` is deliberately
narrowed to only what `lib/pool.ts` reads, per that type's own comment, and
`mbid` isn't in it. A new script reads the raw seed file directly (or
defines its own wider local type), the same way
`scripts/resolve-itunes-ids.ts` already reads fields (`itunesResolvedVia`,
etc.) that never touch `SeedArtistEntry` either — established precedent,
not a new pattern.

The full chain, each arrow a real join that loses tracks:

```
Last.fm ranked track (existing)
  -> iTunes catalog match (existing — lib/pool.ts's intersectByTitle,
     already losing 30-65% to title mismatches per that function's own
     measured diagnostics)
  -> MusicBrainz recording lookup, by artist MBID (NEW — browse recordings
     for the artist, title-match against the SAME Last.fm ranked title
     already in hand, reusing lib/pool.ts's normalizeTitle unmodified —
     it already strips exactly the live/remaster/parenthetical noise this
     match needs)
  -> [ AcousticBrainz Genre Dataset lookup, by recording MBID (dump/index
        lookup, local, no live call once Check 2's provisioning is done)
       OR
       Essentia MusicExtractor on the iTunes preview clip already selected
       for this track (NEW — local audio analysis, no MBID needed) ]
```

MusicBrainz's public API is free at ~1 request/second — another slow
offline script, same shape as `scripts/precompute-catalogs.ts`: a
`makePacer`-style single-request-at-a-time queue (mirroring
`lib/pool.ts`'s existing pacer, at MusicBrainz's own rate instead of
Last.fm's or iTunes's), bounded per-artist retries (not
`resolve-itunes-ids.ts`'s indefinite-retry-on-block pattern — a
MusicBrainz "artist has no matching recording" is a real negative result,
not a transient block, same reasoning `precompute-catalogs.ts`'s own
header already gives for why it doesn't borrow that script's retry-forever
behavior).

**Compounding, not additive.** A track that survives iTunes matching *and*
MusicBrainz matching *and* clears one of the two feature layers is a
smaller set than any single stage's rate suggests — three independent
attrition points multiply. This is the reason Check 0 exists before any
pipeline gets built: the two-way join already measured 30-65% loss; adding
two more joins on top, however healthy each one is individually, could
land the four-way survival rate somewhere Check 0 needs to actually report
rather than this spec guessing at.

## Feature shape — two tiers, one type, not two

```ts
export type SoundFeatureSource = 'acousticbrainz' | 'essentia';

/**
 * Solid, low-level fields both layers can plausibly produce. Present on
 * every SoundFeatures value regardless of source.
 */
export interface CoreSoundFeatures {
  tempo: number; // BPM
  key: string; // exact representation (e.g. "C#", pitch-class + mode) TBD at implementation
  loudness: number; // unit (LUFS vs dB) TBD at implementation — must be the same unit regardless of source, or cross-source comparison breaks the same way mixing listeners/playcount did in the Last.fm layer spec
  danceability: number; // [0, 1]
}

/**
 * AcousticBrainz-only. Essentia's own documentation flags the high-level
 * classifiers behind mood/acoustic-electronic/vocal-instrumental as
 * unreliable enough that this spec explicitly does NOT ask Essentia to
 * reproduce them locally — see "Known problems" below. A track resolved
 * only via Essentia genuinely lacks this half of the vector; it is not a
 * missing-value bug to paper over.
 */
export interface ClassifierSoundFeatures {
  mood: { happy: number; sad: number; aggressive: number; relaxed: number };
  acousticElectronic: number; // [0,1], 0 = fully acoustic, 1 = fully electronic
  vocalInstrumental: number; // [0,1]
}

export type SoundFeatures =
  | ({ source: 'acousticbrainz' } & CoreSoundFeatures & ClassifierSoundFeatures)
  | ({ source: 'essentia' } & CoreSoundFeatures & {
      // Essentia extras this spec DOES ask for (MusicExtractor default
      // output, not a deprecated high-level model) — additive to
      // CoreSoundFeatures, not a replacement for it.
      dynamicComplexity: number;
      onsetRate: number;
    });
```

Any consumer (steering logic, the map) that reads `mood`/`acousticElectronic`/
`vocalInstrumental` must narrow on `source === 'acousticbrainz'` first —
there is no neutral default for these three fields the way `0.5` was a
legitimate default for the Last.fm layer's `reach`. A missing classifier
value is a different fact than a data point sitting at the midpoint of a
real spectrum, and treating it as the same fact was exactly the failure
mode `2026-09-07-taste-space-lastfm-layer-design.md`'s rule 5 discussion
worked through for the popularity axis. Here the honest answer is simpler:
those three fields are absent for an Essentia-only track, full stop, and
any UI/steering surface must be able to represent "this dimension isn't
known for this track," not just interpolate through it.

## Fallback ladder — three tiers, not two

Mirrors `lib/pool.ts`'s existing catalog-vs-live pattern (`loadCatalog`
returning `null`, `resolveOneTrack` falling through to the live path)
exactly, extended by one rung:

1. **Full features** (MusicBrainz match + AcousticBrainz hit) — sound
   steering over the complete feature set, classifiers included.
2. **Partial features** (MusicBrainz match, no AcousticBrainz hit,
   Essentia succeeded on the preview) — sound steering restricted to
   `CoreSoundFeatures` + Essentia's two extras; classifier dimensions
   simply don't participate for this track.
3. **No features** (no MusicBrainz match, or Essentia failed/was never
   attempted) — popularity-only steering. This is precisely today's
   shipped behavior — a track with no `sound` field behaves exactly as
   every track does right now, the same "absent field, no migration"
   guarantee `DiscoveryTrack`/`SwipeEntry`'s Phase 3 fields
   (`artistListeners`/`trackRank`/`dwellMs`) already established.

No tier is ever a hard filter — a track always reaches the deck; sound
steering (whichever interaction option below) only ever *biases* which
tier-1/tier-2 tracks surface more often at a given sound-space position,
the same "bias, never filter" principle
`2026-09-07-taste-space-design.md`'s hard requirement #2 already
established for the popularity axis.

## Precompute pipeline — where this actually runs

New, offline, dev-only — same phase-script family as `scripts/seed-genres.ts`
→ `scripts/resolve-itunes-ids.ts` → `scripts/band-genres.ts` →
`scripts/precompute-catalogs.ts`. Not shipped in the app; enriches the
*existing* `assets/catalogs/<genre-slug>.json` files with one new optional
field per entry rather than inventing a parallel data file:

```ts
// lib/pool-types.ts — CatalogEntry gains:
export interface CatalogEntry {
  // ...existing fields (title, rank, playcount, previewUrl, itunesTrackId,
  // artworkUrl, album) unchanged...
  sound?: SoundFeatures;
}
```

Sequence, per artist already present in a genre's catalog file (this
enriches the output of `scripts/precompute-catalogs.ts`; it does not
re-fetch anything that script already resolved):

1. Resolve the artist's MusicBrainz ID → recording list (paced, ~1 req/s).
2. Title-match each catalog entry (`hits`/`deepCuts`/`mixed`, i.e. exactly
   the tracks already selected — no reason to enrich a track the app would
   never surface) against the recording list via `normalizeTitle`.
3. On a match, look up that recording MBID in the provisioned AcousticBrainz
   index (Check 2). Hit → tier 1, write `sound` with `source:
   'acousticbrainz'`.
4. No AcousticBrainz hit (matched or not) → download the entry's own
   `previewUrl` (same pacing budget iTunes catalog lookups already use —
   this is another call against the same ~20/min ceiling
   `scripts/resolve-itunes-ids.ts`'s own measured soft limit established,
   not a separate budget) and run Essentia's `MusicExtractor` locally. Success
   → tier 2, `source: 'essentia'`. Failure (decode error, extraction
   timeout) → tier 3, no `sound` field, exactly like today.
5. Resumable and per-entry-checkpointed, same convention
   `precompute-catalogs.ts` already uses: skip any entry that already has a
   `sound` key (or has been explicitly marked as attempted-and-failed, to
   avoid retrying a track that will predictably fail again every run) and
   write the file back after every single entry, not batched per artist or
   per genre.

## Interaction options, cheapest first

### 1. Directional steering (recommended starting point)

Extend the existing post-like steering surface (`SteeringRow`,
`2026-09-05-always-available-steering-design.md`) with sound directions —
darker, faster, more organic, more electronic. Each nudges a persisted
cursor in feature space (mirrors `TasteSpacePosition`'s persistence shape,
without reviving any of that spec's now-closed scoring code); the next
refill biases toward that neighborhood. No new screen, no map, reuses
existing UI conventions directly.

**Why this is the right first build, not just the cheapest one:** it
degrades gracefully across the fallback ladder for free. "Darker" and
"faster" are answerable from `CoreSoundFeatures` alone — every tier-1 *and*
tier-2 track can participate. A direction like "more organic" that leans on
`acousticElectronic` simply has less to work with among tier-2-only
tracks (per the ladder above, that field is absent there) — a narrower
candidate pool for that one direction, not a broken feature. A 2D map
(option 2) has no equally graceful way to place a track that's missing a
third of the feature vector its axes might be built from.

### 2. The 2D sound map

A draggable point in a 2D projection of feature space; the deck refills
from whatever neighborhood the point sits in. Two axis choices, with a real
tradeoff:

- **Hand-picked, interpretable axes** (e.g. energy vs. valence, tempo vs.
  acousticness) — a user can read the corners without training. Costs
  expressiveness: two axes chosen by hand cannot represent everything
  `SoundFeatures` carries, the same way pool-steering's four discrete
  presets don't represent every point on its own continuous popularity
  space.
- **PCA/UMAP over the corpus** — captures more of the actual variance in
  the data, at the cost of axes that don't mean anything nameable to a
  user ("up" isn't "happier," it's "whatever direction the data happens to
  spread most along"). Also requires a stable corpus to project against —
  re-running PCA/UMAP as more tracks get precomputed over time would move
  where existing points sit, which is a real UX problem for a persisted
  position, not just a modeling detail.

Both variants inherit the tier-2 problem above unresolved: a projection
built (by either method) over the full `SoundFeatures` vector has no
principled place to put a track missing a third of its inputs, worse than
option 1's per-direction degradation. Not designed further here — this
spec surfaces the tradeoff, it doesn't resolve it.

### 3. Both layers at once

The map (option 2) positions the deck in sound space; preset chips
(existing, `components/discovery/preset-chips.tsx`, entirely unchanged)
keep controlling popularity on top, exactly as they do today. This is
the full realization of the pitch at the top of this document — genuinely
independent, simultaneously visible dials — but it's only as sound as
whichever version of option 2 it's built on, plus it inherits pool-steering's
own existing band-widening/starvation behavior (`lib/pool.ts`'s
`eligibleArtists`/starvation-widening, unchanged) now needing to coexist
with a *second* relaxation mechanism when the sound-space neighborhood also
comes up short. That interaction — two independent "relax rather than
stall" mechanisms firing on the same refill — is flagged, not designed,
here.

## Known problems

- **Coverage is thinnest exactly where "Buried" needs it most.** Preset D
  (`components/discovery/preset-chips.tsx`: `D: 'Buried'` — obscure artist
  × deep-cut track) is this feature's own flagship use case ("someone with
  40k listeners"), and it's precisely the corner where MusicBrainz/
  AcousticBrainz coverage is likely weakest — mainstream, well-catalogued
  artists are exactly who gets submitted to MusicBrainz and scrobbled
  enough to have rich metadata. The two-way iTunes join already shows this
  shape (deep cuts discard at a higher rate — see `precompute-catalogs.ts`'s
  own per-genre `titleMismatchRate` output); nothing about adding two more
  MBID-keyed joins is expected to reverse that gradient, and Check 0 should
  report coverage broken out by artist band (obscure vs. popular), not just
  as one pooled number, so this gradient is measured rather than assumed.
- **The AcousticBrainz dataset is frozen.** No submission has happened
  since the project stopped collecting data — a track released after the
  freeze can never get a tier-1 hit, permanently, regardless of how
  well-known it becomes later. Essentia's local-extraction layer is what
  keeps a new release from reading as "no sound data" forever, but only
  for `CoreSoundFeatures` — the classifier dimensions
  (`ClassifierSoundFeatures`) are unavailable for every post-freeze release,
  forever, by construction, not as a temporary gap.
- **Each additional join loses tracks, multiplicatively — see "The join
  problem" above.** Restated here because it's the single biggest risk to
  this spec's viability and Check 0 exists specifically to replace this
  bullet's hand-waving with a real number.
- **Essentia's deprecated high-level models.** Essentia's own documentation
  flags reliability problems with several high-level classifiers — this
  spec deliberately scopes Essentia's contribution to `CoreSoundFeatures` +
  `dynamicComplexity`/`onsetRate` only. No attempt is made to have Essentia
  reproduce mood, acoustic/electronic character, vocal/instrumental
  character, or Spotify's retired speechiness/liveness/instrumentalness
  fields — those exist only via the AcousticBrainz tier, or not at all for
  a given track.
- **New local infrastructure, not just new code.** The AcousticBrainz dump
  (Check 2) and any Essentia native/WASM dependency live on whatever machine
  runs the precompute scripts, not in the shipped app — real disk space and
  a real new toolchain dependency, distinct in kind from every other script
  this project has added so far (all of which needed only network access
  and this repo's existing Node setup).
- **Preview fetching is not a free second data source.** Downloading a
  preview clip for Essentia to analyze consumes the same iTunes call budget
  (`itunesDelayMs`, `lib/pool-config.ts`) the existing catalog-fetch and
  precompute pipelines already pace against — this spec's Essentia layer
  adds load to an already-conservative shared limit, not a separate one.

## Future work (not designed here)

**ListenBrainz** — open, MBID-keyed listening-event data (what gets
listened to together) — is a plausible third independent dial, using the
exact same recording-MBID join key this spec already builds. Noted as the
natural next extension once this spec's own join actually exists; nothing
about ListenBrainz's API, coverage, or integration shape is investigated
here.

## Out of scope

- All implementation — this document is a design spec only, per this
  document's own instructions at the top.
- Actually running Checks 0, 1, or 2, or picking any of the numeric
  constants they'd inform (MusicBrainz retry counts, Essentia timeout,
  which axes a hand-picked 2D map would use).
- Choosing between interaction options 2 and 3, or between hand-picked and
  PCA/UMAP axes for option 2 — recommended starting point is option 1 only;
  the rest are designed enough to evaluate, not committed to.
- ListenBrainz integration of any kind.
- Any change to `lib/pool.ts`'s existing popularity-axis logic
  (`eligibleArtists`, starvation widening, the leftover cache, preset
  bands) — this spec only adds a new optional field or ships new
  standalone scripts.
- Any runtime/app-side UI for options 1-3 — this spec designs the data
  layer and the tradeoffs; the actual screen/component work is a separate
  spec once a coverage number and an interaction option are both settled.
- Reviving or modifying anything in `2026-09-07-taste-space-design.md` or
  `2026-09-07-taste-space-lastfm-layer-design.md` — that popularity-axis
  thread is closed by pool-steering's shipped implementation, not reopened
  by this spec.

## Files touched (once this moves past spec)

| File | Change |
|---|---|
| `lib/pool-types.ts` | New `SoundFeatureSource`/`CoreSoundFeatures`/`ClassifierSoundFeatures`/`SoundFeatures` types; `CatalogEntry` gains optional `sound?: SoundFeatures` |
| `scripts/precompute-sound-features.ts` | New — MusicBrainz recording lookup + title-match, AcousticBrainz dump/index lookup, Essentia fallback extraction; enriches existing `assets/catalogs/<genre-slug>.json` files in place |
| `scripts/precompute-sound-features.test.ts` (or a coverage-spike-only script, name TBD) | New — Check 0's ~50-artist coverage measurement |
| `assets/acousticbrainz-index/` (or similar, name/format TBD by Check 2) | New, dev-only, not shipped — local provisioned index/dump, gitignored given likely size |
| `components/discovery/steering-row.tsx` | Extended (not designed here) once interaction option 1 is actually built — new sound-direction buttons alongside the existing artist/sound steering actions |
