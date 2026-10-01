# Tasteform — design

**Date:** 2026-09-30 · **Status:** approved in chat after the image prototype (`~/Desktop/tasteform-prototype.png`),
with one addition from the user: re-form it by genre and other things so every cover is visible, tap one to hear it.

## What the listener gets
The You tab opens on one living shape made of every song they saved. Each save is a cell painted
with its cover's color; near cells melt into one body, far ones stay as islands.

- **Shape** (default): each genre family grows in its own direction; famous artists sit in the middle,
  rare finds reach the edges (the "frontier"). A few saves huddle into one cell; the branches reach out
  as the count grows. It breathes slowly. Pinch or double-tap to zoom in to the covers; one finger moves
  around while zoomed (the page stops scrolling until you zoom back out).
- **Genre · Listeners · Color · When**: the same cells fly into labeled islands big enough to see every
  cover. Listeners goes Everyone knows → Known, not famous → Under the radar → Almost nobody (the same
  words as the reveal). When is newest month first, first saves in the middle of each island.
- **Tap any cover** to hear its preview. It gets a red ring and pulses while playing; the Liked screen's
  mini player pins to the bottom (play/pause, like, comments, Apple Music/Spotify).
- A **cream ring** marks a song saved blind (double-tap on the blind card, i.e. a `like` in swipe history).
  Saved within 8 seconds of listening makes the cell a little bigger.

## Data
- Liked tracks + swipe history, already on the phone. Nothing about the listener is uploaded; the only thing sent out is each song's public preview clip, for breathing (below).
- Cover color: iTunes serves any artwork as a 3×3 PNG (`…/3x3bb.png`, CORS-open). `lib/cover-color.ts`
  decodes it (fflate for zlib) and keeps the most colorful of the 9 pixels, lifted so it glows on navy.
  Cached per artwork URL in AsyncStorage; fetched 4 at a time.
- Genre direction uses families (`genreFamily`), since iTunes genres are many and oddly specific.
- Listener counts are the ones stored at save time (`artistListeners`).

## Breathing (energy from the audio)
Each saved song's 30s iTunes preview is sent once to **ReccoBeats** (`POST /v1/analysis/audio-features`,
free, no key), which returns Spotify-style features: energy, valence, tempo and more. React Native's upload
reads the part's `uri` straight from the web, so nothing is saved on the phone first. Results are kept per
track id in AsyncStorage; 2 at a time, at most 80 per session, stop on a 429.
- The body breathes at the **average energy**: calm saves slow and shallow (6s a breath), intense ones quick
  and deep (1.8s). Each cover also pulses at its own song's energy, out of step with its neighbors.
- Under the shape, one sentence: "It breathes slowly: most of what you save is calm." (after 3 measured songs).
- **Why not tempo:** on 30s clips ReccoBeats' tempo is shaky (Karma Police came back 123, it's ~75; the first
  10s vs the full clip disagreed by up to 50 BPM). Energy held steady, so energy drives the pace.
- **What else was tried (2026-09-30), on 14 random catalog artists under 60K listeners:** ReccoBeats measured
  14/14 in 1–2s each. Last.fm track mood tags: 0/14 (artist tags 2/14). Deezer tempo: 6 of 24 even for famous
  songs, 0 bpm for the rest. On-device sampling (`useAudioSampleListener`) needs the microphone permission on
  Android, which reads as alarming in a music app.
- **Risks to report honestly:** ReccoBeats doesn't publish rate limits or who runs it; each first measure costs
  ~1MB down and ~1MB up; sending Apple's preview clip to a third party for analysis is a gray area under the
  iTunes preview terms. With no data, the shape breathes at one slow default pace.

## Code
- `lib/tasteform.ts` (pure, tested in `lib/tasteform.test.ts`): `formSongs`, `formLayout` (shape and
  islands), `bodyPath` (metaball field + marching squares → one smoothed SVG path).
- `components/tasteform/tasteform-body.tsx` draws the body; `components/tasteform/tasteform.tsx` the
  covers, modes, zoom and taps; `hooks/use-cover-colors.ts` the colors; `hooks/use-song-feel.ts` the energy; `app/(tabs)/explore.tsx` owns playback.
