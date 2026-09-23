# Blindspot — Implementation Plan (Prototype 3, Weeks 4–15)

Written for Prototype 3 (Wk 4, "Project architecture & technical feasibility").
Revised after running `scripts/spike-sound-features.ts` — see "What the spike
taught us" below for what changed between the first draft of this plan and
this version.

## Scope

**Launching by December (semester scope):**

- Audio feature extraction from iTunes preview clips — BPM, key, energy,
  vocal-vs-beat ratio.
- A taste equation derived from blind ratings (stated preference vs. what the
  swipe data actually shows).
- Gap reveal — surfacing the delta between stated and actual taste.
- Export to Spotify/Apple Music.

**v2, after the semester — not scoped or built this term:**

- Matching/chat between users.
- AI-generated tracks.
- Taste drift over time.

**Explicitly cut:** the ten-track blind quiz (`lib/taste-test.ts`'s
setup→playing→reveal→summary flow). That file is already unreachable from any
route today (see `CLAUDE.md`'s note on it) — this plan does not revive it.
Its removal means **gap reveal has no existing "stated taste" input
mechanism** — this is an open design question, not a build task; see
Risks below.

## End-of-semester goal (Dec 3 showcase, P12)

A build where: pool-steering (shipped) is joined by a working sound-space
axis (at least `CoreSoundFeatures` — tempo/key/loudness/danceability — even
if AcousticBrainz's classifier tier never clears coverage), a taste equation
computed from real swipe/listen data, a gap-reveal screen comparing that
equation against some captured "stated" signal, and a real Spotify/Apple
Music export (not today's share-a-text-list `modal.tsx` mechanism — an
actual playlist created via each platform's API).

## Milestones, Weeks 4–13

| Wk | Prototype | Syllabus topic | Blindspot deliverable |
|---|---|---|---|
| 4 | P3 (9/24) | Architecture & feasibility | This plan + the sound-features spike (done, see below). |
| 5 | P4 (10/1) | Data modeling & persistence | Harden existing `lib/discovery-storage.ts` (AsyncStorage: swipe history, liked tracks, export batches, discovered genres). Demo explicit empty states (no likes yet, no export history yet) and a restored state (kill and relaunch the app, confirm liked tracks/history survive) — both currently untested, not currently unbuilt. |
| 6 | P5 (10/8) | Debugging & instrumentation | Keep using the existing `bugs.md` dated-entry convention (already established, e.g. the 2026-09-14 `fetchTracksByGenre` entry) — commit 3 real entries with symptom/evidence/fix, spread across at least 2 different weeks, not backfilled in one sitting. |
| 7 | P6 (10/15) | Asynchronous behavior | Give the deck-refill path (`lib/discovery.ts`'s `refillQueue`/`refillQueueWithFallback`, already async against a rate-limited iTunes API per `features.md`'s 2026-09-14 pacing entry) explicit UI states: waiting, success, failure, retry, and user-initiated abandonment — today failures are mostly silent/best-effort. |
| 8 | P7 (10/22) | Device-specific capability | Extend the existing haptics usage (`HapticTab`, swipe feedback) or add background-audio-continues-when-locked behavior via `expo-audio` — tested on a physical phone, not just simulator. |
| 9 | P8 (10/29) | External interfaces & unreliable input | The iTunes catalog fetch already qualifies as "external + unreliable" (`bugs.md`'s 2026-09-14 entry, `features.md`'s rate-limit entry). Formalize handling for malformed/partial responses — missing `previewUrl`, missing artwork, empty genre results — as a real tested path, not incidental behavior. |
| 10 | P9 (11/5) | Testing & regression | Extend `lib/discovery.test.ts` (Node's built-in test runner, already in place). Define essential behavior (queue refill correctness, `normalizeTitle` matching), add regression tests, then make a real change and show the tests catch a break. |
| 11 | P10 (11/12) | Accessibility | Audit with VoiceOver/TalkBack and larger text sizes. At least 3 concrete fixes — candidates: accessible labels on `SwipeCard`'s gesture-only actions (skip/like/jump have no non-gesture equivalent today), dynamic type support, contrast check against the dark-only theme (`constants/theme.ts`). |
| 12 | P11 (11/19) | Privacy, security, dependencies, failure audit | Justify every permission (haptics, network, storage) and every external dependency — iTunes, Last.fm, and, if sound-space ships, MusicBrainz/AcousticBrainz/`essentia.js`/`node-web-audio-api`. Document what happens when each one is unavailable. |
| 13 | — | Thanksgiving | — |
| 14 | P12 (12/1) | Final prototype | Integration of all four launch-scope features for the Dec 3 C3 Showcase. |
| 15 | — | Final paper, App Store publishing | — |

Weeks 5–12 are framed around syllabus checkpoints, not a separate feature
schedule — the four launch-scope features (audio features, taste equation,
gap reveal, export) get built as the substance behind those checkpoints
(e.g. the taste equation is exactly what Week 10's "essential behavior" for
regression testing should be; the sound-space precompute pipeline is exactly
what Week 12's dependency audit should cover), not bolted on afterward.

## What the spike taught us, and how the plan changed

Ran `scripts/spike-sound-features.ts` against a real preview clip (Daft
Punk – "One More Time", pulled from `assets/catalogs/electronic.json`) to
de-risk `docs/superpowers/specs/2026-09-17-sound-space-design.md`'s Check 1
before committing to a toolchain for audio feature extraction.

**Before the spike**, this semester's scope (see top of this document) named
**librosa/Demucs** — a Python audio-analysis stack — as the intended tools,
separate from this repo's existing TypeScript/Node toolchain.

**What the spike found:** `essentia.js` can't decode this project's real
AAC/M4A preview format on its own — its only documented decode path
(`getAudioBufferFromURL`) requires a browser `AudioContext`, a dead end in
plain Node scripts. But `node-web-audio-api` (a real, non-browser
`AudioContext` implementation for Node) decodes the same AAC/M4A clip
directly, no `ffmpeg` needed (confirmed not installed on this machine).
Feeding the decoded PCM into `essentia.js`'s `RhythmExtractor2013`,
`Danceability`, and `KeyExtractor` produced plausible results (123 BPM, G
major, danceability 1.18) at ~18x real time — comfortably faster than the
iTunes pacing budget `features.md`'s 2026-09-14 entry already established as
the real bottleneck.

**How this changes the plan:** BPM, key, loudness, and danceability
(`CoreSoundFeatures` in the sound-space spec) look extractable entirely
inside this project's existing Node/TypeScript toolchain — no separate
Python environment needed for that portion. **This does not cover the
vocal-vs-beat ratio** named in this semester's scope: that requires source
separation (splitting a track into vocal and instrumental stems, which is
what Demucs actually does), a different technique from anything this
spike tested. Essentia's own documentation also flags its high-level
`vocalInstrumental` classifier as unreliable enough that the sound-space
spec deliberately excludes it from the Essentia-only tier. Whether
vocal-vs-beat extraction needs Demucs (Python, likely too heavy to run
in-toolchain, more plausibly a one-time offline precompute step or a hosted
API) is still open and unresolved by this spike — flagged as a risk below,
not solved.

## Technical risks

1. **Vocal-vs-beat ratio has no proven extraction path.** The spike de-risked
   tempo/key/loudness/danceability, not this. Demucs-style source separation
   is a materially different (and heavier) technique; whether it runs
   offline-only, needs a hosted API, or gets cut from this semester's scope
   is an open decision, not yet made.
2. **Coverage for the richer feature tier is unmeasured.** The sound-space
   spec's own Check 0 (MusicBrainz/AcousticBrainz match rate) and Check 2
   (Zenodo dump provisioning) are untouched by this spike — `CoreSoundFeatures`
   via Essentia is de-risked, but `ClassifierSoundFeatures` (mood,
   acoustic/electronic, vocal/instrumental) may have low real-world coverage,
   and that's still unmeasured.
3. **Gap reveal has no "stated taste" input anymore.** Cutting the ten-track
   quiz removes the only existing mechanism for capturing stated preference.
   Needs a real design decision before Week 9–10's taste-equation work can
   start, not just an implementation task.
4. **"Export to Spotify/Apple Music" is scoped much bigger than what exists
   today.** `app/modal.tsx`'s current export is a share-sheet text list (an
   Apple Music track URL plus a Spotify search-URL fallback via
   `buildSpotifySearchUrl`) — not API-based playlist creation. Real export
   needs OAuth against each platform, app registration, and API quota
   handling; this is new infrastructure, not an extension of
   `appendExportBatch`.
5. **iTunes rate limiting is a known, already-live constraint.** `bugs.md`
   and `features.md`'s 2026-09-14 entries already document a tight, bursty
   rate limit; any new feature that adds iTunes calls (sound-space's preview
   downloads included) shares that same budget, not a separate one.
