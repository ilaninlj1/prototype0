# New Home: blind card, in-place reveal, sound prints

Date: 2026-10-08. Branch `new-home` (worktree `~/Desktop/prototype0-new-home`).

## Why

Three design critiques of the Oct 8 screen recording (Claude, Gemini, ChatGPT) agreed on the same core problems with Home, which is the product:

- Only one of three gestures is taught. The card says "Swipe right to see who it is. Double-tap to save it." Left and down are never explained.
- The reveal flips into a different card (`FlipInEasyY`), the big red listener count becomes the hero, and the cover sits below the fold. You move on with a Next button, so the swipe loop stops being a swipe loop after one card.
- The collage under the card is album covers. Nothing shows that the art comes from the music or from your choices.
- Pause is a 400ms hold ("PAUSED — HOLD TO PLAY").

The user also asked for songs to be divided by real sound data (BPM, key, notes) and for art in the style of their `claude-motion-reel.html` reference: particles flowing and gathering into circular formations, grain, fine lines, mono micro-labels.

Decisions made with the user on 2026-10-08:

1. A skip stays blind. Only a right swipe reveals who it is.
2. A right swipe means reveal + more like this. Save stays separate (double-tap or the Save button).
3. The strip under the card becomes generated prints, not album covers.
4. Sound facts (BPM, key) may show on the blind card; they describe the sound, not the artist.

## What was verified before writing this

- **ReccoBeats catalog lookup returns key and mode.** `GET https://api.reccobeats.com/v1/audio-features?ids=<ISRC,...>` accepts ISRCs and returns `tempo, key, mode, energy, danceability, acousticness, instrumentalness, speechiness, liveness, loudness, valence` (plus `isrc` and a Spotify `href`). Several ids per call work; one ISRC can return several recordings. No key needed. Rate limits aren't published; a 429 carries `Retry-After` (https://reccobeats.com/docs/documentation/rate-limiting).
- **Matching works through Deezer.** `GET https://api.deezer.com/search?q=<title> <artist>` (plain query; the `artist:"…" track:"…"` syntax returned nothing) returns each track's `isrc`. Filter to an exact (case-insensitive) artist match. On 30 random catalog songs, 26 got an ISRC and **24 got BPM, key and mode**, including small artists (Grupo Extra, Teminite, Appleby, Urbandawn).
- **Deezer's API terms are non-commercial only** (https://developers.deezer.com/termsofuse §IV). Fine for the class project. If Blindspot goes commercial, swap the matcher for MusicBrainz (open data, `recording?query=…&inc=isrcs`, 1 request/second).
- **The app currently uploads Apple previews to ReccoBeats** (`lib/song-feel-api.ts`). Apple's Search API terms say previews must be "streamed only, and not downloaded, saved, cached, or synchronized with video" (https://performance-partners.apple.com/search-api). This project moves every sound lookup to the ISRC route and stops the upload.
- **Skia ships in Expo Go for SDK 57** (`@shopify/react-native-skia` 2.6.2 in `expo/bundledNativeModules.json`). It's a native module, so the Android APK needs a rebuild.
- **The blue gear in the recording isn't in the app** (no gear or settings button in `app/` or `components/`). It's most likely iPhone AssistiveTouch.

Not available for free without analyzing the audio: per-note activity (chroma), beat positions and downbeats. Analyzing the playing audio on the phone (`useAudioSampleListener`) needs the microphone permission on Android, so it's out of scope. Motion is **tempo-driven** (period = 60/BPM, phase from the playback clock), never labeled as beat-synced, and no "BAR" counter is shown.

## Scope

In: Home's blind card, the three action buttons, drag labels, tap to pause, the in-place reveal, the Details sheet, more-like-this, the genre-jump stamp, the print renderer, the piece under the card and on the art screen, the sound index and live lookup, and moving the Tasteform, Taste Decoded and the Blind Spot Test to the new sound source.

Out (later projects, in this order): sound filters in Tune (Pace, Intensity, Texture, Harmony, Rhythm), the You tab cut-down, the Play tab's single featured challenge. Daily Drop, the Blind Spot Test, Blind Pack and DJ Picks keep the old `CardFace`/`RevealCard` for now.

## 1. Sound data

### Shape

```ts
// lib/sound.ts (pure)
export type SoundFeatures = {
  tempo: number;          // BPM
  key: number | null;     // 0 = C … 11 = B; null when ReccoBeats gives -1
  mode: 0 | 1 | null;     // 1 major, 0 minor
  energy: number; danceability: number; acousticness: number; instrumentalness: number;
  speechiness: number; liveness: number; valence: number;
  loudness: number;       // dB, usually -60…0
};
export type SoundRecord =
  | { status: 'measured'; features: SoundFeatures; source: 'index' | 'live'; isrc?: string; at: number }
  | { status: 'unmatched'; at: number };   // looked up, nothing found; retried after 14 days
```

Values are ReccoBeats catalog values for the whole recording, not the 30-second preview. Unknown stays `null`; nothing is invented. Index records carry no ISRC (it isn't bundled); live records keep theirs.

### The bundled index

`scripts/build-sound-index.ts` (new, `npm run build-sound-index`) walks every hit and deep cut in `assets/catalogs/*.json`:

1. Clean the title (drop bracketed parts and anything after ` - `), search Deezer with `<title> <artist>`, keep results whose artist name matches exactly (case- and accent-insensitive). Prefer a result whose cleaned title matches; reject a live/remix/acoustic result when our title isn't one, and the reverse.
2. Batch the ISRCs into ReccoBeats `audio-features` calls (start at 20 per call; when one ISRC returns several recordings, take the first).
3. Write progress to `scripts/.sound-index-raw.json` (resumable, gitignored, never bundled). Write `assets/sound-index.json` at the end: `{ v: 1, builtAt, fields: [...], songs: { [itunesTrackId]: [tempo, key, mode, energy, …] } }`, with numbers rounded to 3 places and `-1` for a null key or mode.
4. Pace Deezer at 4 requests/second and ReccoBeats at 1 request/second, honor `Retry-After`, and time out each request at 30s. The script stops cleanly after `--minutes N` (default 50) so a run fits inside one background job; re-running continues.
5. It prints coverage at the end (matched / total, per genre).

`lib/sound-index.ts` loads the JSON lazily on first use and answers `soundFor(itunesTrackId): SoundFeatures | null`. If the bundle grows by more than 1.5 MB, switch to a packed binary asset (only if measured).

### Live lookup (songs outside the index)

`lib/sound-lookup.ts` runs the same Deezer → ReccoBeats steps on the phone for artist-steered and searched songs. Records are cached in AsyncStorage under `blindspot:sound:v1` (map of track id → `SoundRecord`). Two requests run at once at most. After a 429 it stops for the rest of the session, or until `Retry-After` passes. On web, Deezer has no CORS headers, so the live lookup is skipped there and only the index answers.

`hooks/use-sound.ts`: `useSound(track): { record: SoundRecord | null; loading: boolean }`, the index first, then the cache, then a live lookup. A live lookup needs the title and artist; with only an id, just the index answers.

### Moving the existing features over

`lib/song-feel-api.ts` stops posting previews to `/v1/analysis/audio-features`. `Measurable` becomes `{ id; trackName?; artistName? }` (no preview URL). `measureMissing`, `loadFeels` and `peekFeels` all read the new sources (index, cache, live lookup) and map `SoundFeatures` onto the existing `SongFeel`. The Tasteform and Taste Decoded already pass saved tracks with names. `app/blind-test.tsx` (line 83) passes the song's title and artist too. The old SongFeel cache (preview-measured, a different model) is dropped: its storage key is bumped, so nothing measured the old way gets compared against the new baselines. `assets/genre-sound.json` is rebuilt from the index (every catalog song with data instead of 30 per genre) by a new `--from-index` mode of `scripts/measure-genre-sound.ts`. It must pass the existing `sanityProblems` checks before it's written.

## 2. The print

A print is the picture of one song's sound. Same song + same recipe version = the same picture, every time.

### Recipe (`lib/print-recipe.ts`, pure)

`recipeFor(trackId, record, coverColors) → PrintRecipe`, versioned `RECIPE_V = 1`:

| Input | Visual role |
|---|---|
| key + mode | **Formation.** Three attractor rings at the triad's notes, placed on a circle-of-fifths dial: major = tonic, major third, fifth; minor = tonic, minor third, fifth. The tonic ring is the largest. Related keys look related. |
| key + mode | **Color.** Tonic picks one of 12 hues from a palette that skips violet (the theme bans it): warm reds, oranges and golds for major, teals and blues for minor. Cream and near-black are always present. |
| tempo | **Motion.** Particle speed, and the rings breathe once per beat of the *visual tempo*: the BPM halved or doubled into 70–140 (so 70 and 140 look and move the same, and a half-time reading doesn't change the print). |
| energy | **Density and turbulence.** 80–240 particles on the card. |
| acousticness | **Texture.** Soft grain dots (high) vs. sharp fine lines (low). |
| danceability | **Regularity.** Even breathing (high) vs. uneven (low). |
| speechiness / instrumentalness | **Stroke.** Short dashes (spoken) vs. long unbroken trails (instrumental). |
| loudness | **Brightness.** |
| key known, mode unknown | **Dyad.** Tonic and fifth rings only. |
| key unknown, other features known | **Neutral formation.** One centered ring with two seeded satellites; colors from the cover; the other features still apply. |
| no data | **Fallback.** One ring, colors from the cover (`lib/cover-color.ts`), seeded by track id. Details says "Drawn from the cover — no sound data for this song." |

Valence isn't used, so the art never claims a song is happy or sad. Randomness comes only from a seeded PRNG (mulberry32 on the track id).

`settledPrint(recipe) → PrintStill`: runs the particle simulation a fixed number of steps from the seed and returns the trails as polylines and dots in a 0–1 square. This is what the piece and exports draw.

### Rendering (`components/print/`)

- `LivePrint` (Skia `Canvas`): the moving version on the blind card. A Reanimated frame callback steps the particles on the UI thread. Breathing phase = `currentTime × tempo / 60` from the shared player, so pause and seek keep motion and sound together. Paused = frozen. Only the top card animates; cards underneath show their settled print, static.
- `PrintStill` (Skia): draws a `settledPrint`, at any size.
- **Reduce Motion** (`AccessibilityInfo.isReduceMotionEnabled`): the card shows the still print, and the reveal is a crossfade.
- **Budget:** at most 240 particles. Measure on the user's Android phone, and only cut further if it drops below 50fps.

## 3. The blind card (`components/home/listen-card.tsx`, Home only)

Layers, back to front: the cover blurred (`COVER_BLUR`) at 25% opacity, the `LivePrint`, the mono labels, the drag label.

- **Mono labels** (DM Mono, 11pt, `textSecondary`): top left `PRINT 12/50` (the piece's next slot), top right `00:12 / 00:30` from the real playback position. Bottom: `148 BPM · C♯ MAJOR` when measured; just the tempo when key is unknown; nothing when unmatched. A 2px progress line runs along the bottom edge.
- **Copy:** "Just listen." only. The buttons teach the rest.
- **Tap** toggles play/pause (a play glyph shows while paused). **Double-tap** saves (heart burst, success haptic). Tap no longer skips or likes by screen half, and hold does nothing. The single tap waits for the double-tap window, as today.
- **Drag labels:** `SKIP` (left), `MORE LIKE THIS` (right), `NEW GENRE` (bottom), each fading in with drag distance and fully shown at the commit threshold (`DEFAULT_SWIPE_THRESHOLDS`, 120). One selection haptic when a drag crosses the threshold (and again if it crosses back). The existing skip/like tints stay.
- **Crossfade** on a left drag stays exactly as it works now.

## 4. The buttons under the card (`components/home/action-row.tsx`)

| State | Left | Middle | Right |
|---|---|---|---|
| Blind | `← Skip` | `↓ New genre` | `More like this →` |
| Revealed | `♥ Save` (filled once saved) | `Details` | `Next →` |

Each button calls the same handler as its swipe, so a tap and a swipe produce one identical event. At least 48pt tall; cream outline buttons, with the right-hand one filled cream (navy text) as the primary action.

## 5. Swipe right: the reveal

The card springs back to center instead of flying off. Sequence (about 1.2s):

1. 0–300ms: particles settle onto the song's `settledPrint`.
2. 300–700ms: the cover sharpens in the same frame (blur and opacity up to full), with the print fading back to a 64pt corner badge. One medium haptic when it's sharp.
3. 850ms: title (Archivo) and artist slide up from the bottom of the card over a dark gradient. Below them, in one small line: `83.8K listeners · Call it` (the existing `CallButton` logic, now a small chip).
4. 900ms: a copy of the badge flies into its slot in the piece (replacing today's `FlyingCover`); the strip label updates.

The preview keeps playing. On the revealed card, a left or right swipe (or Next) moves on, and down still jumps genre. Nothing auto-advances.

Logged as today: `logSwipe(track, 'reveal')`. The full-res cover is prefetched (`Image.prefetch`) when a card becomes the top card, and if it hasn't loaded by step 2 the blurred one sharpens as soon as it arrives.

**The recipe freezes at commit.** Whatever sound data is known when the right swipe commits makes the recipe, and that one recipe is used for the settle, the badge, the flight and the stored mark. Data that arrives later doesn't change that mark. Before commit, the live card may still morph.

**On the revealed card**, gestures and buttons dispatch differently: left, right and Next call `handleRevealDone` (nothing new is logged; the reveal was). Down clears the reveal and jumps genre without logging a second action for the same song. Each captures an undo snapshot first.

**Undo** of a reveal puts the card back blind, removes the mark, and cancels more-like-this.

### Details sheet (`components/home/details-sheet.tsx`)

A bottom sheet opened by `Details` holding everything `RevealCard` had below the fold: the big cover, `HumanBadge`, Apple Music / Spotify / Last.fm links, Comments, Call it with a one-line explanation ("Call it: we'll tell you if they blow up. 3 a week."), plus a new **The sound** section in plain words: "Fast · 148 BPM", "C♯ major", "Loud and dense", "Mostly instrumental". Source line: "Measured by ReccoBeats." For an unmatched song: "No sound data for this song yet."

### More like this (`lib/sound-neighbors.ts`, pure)

`soundDistance(a, b)`: weighted sum of tempo (relative difference, the smallest of ×0.5, ×1, ×2), energy, danceability, acousticness, instrumentalness, and key closeness (circle-of-fifths steps; a relative major/minor counts as the same key). When either song's key or mode is unknown, the harmony term is dropped and the remaining weights are rescaled to the same total.

`pickNeighbors(target, candidates, n = 3)` returns the closest `n` among candidates that have sound data.

After a right swipe on a song with sound data, the next 3 cards are its nearest neighbors, chosen without any network call. A new `lib/pool.ts` export, `nearestBySound(preset, genre, target, n, exclude)`, scans the current genre's precomputed catalog, keeps only entries the preset's existing rules allow (same band, hit-rank and deep-cut filters the pool applies), drops seen artists, known Spotify-file artists, AI-flagged artists and the target's artist, ranks those with index data by `soundDistance`, and converts the top `n` to `DiscoveryTrack`s the same way the catalog path already does. They're inserted after the current card. If fewer than 3 come back, the rest of the queue stays as it was. Then the feed returns to normal. A one-line note above the card for those 3 cards: "More like this: fast, loud, C♯ major." With no sound data on the target, a right swipe still reveals, and the note says "More like this: same genre".

### One action at a time

Buttons bypass `SwipeCard`'s local `exiting` guard, and the handlers await logging before they move the queue. So Home gets one synchronous `actionLockRef`: every committing action (any swipe, any button, Undo) takes it first and is ignored if it's held. It's released when the next card (or the reveal) is in place. `refillEpochRef` becomes the single generation token. Reveal, undo, steering, genre jumps and neighbor inserts all bump it, and every async result (refill, neighbor insert, listener count, sound lookup applied to the queue) checks it before writing state.

## 6. Swipe left: skip

As today: flies off left, stays blind, logs `skip`, promotes the crossfade peek. Leaves a ghost mark in the piece.

## 7. Swipe down: new genre

The card drops off the bottom. The new genre's name stamps in the card area in big Archivo for about 700ms, with `NEW TO YOU` in mono underneath only when that genre isn't in the user's history (`deriveGenresHeard`). Then the next card arrives. The piece's line forks into a new branch.

## 8. The piece

### Model (`lib/piece.ts`, pure; replaces `lib/collage.ts`)

```ts
type PieceMark = {
  trackId: number;
  kind: 'reveal' | 'skip';
  saved: boolean;
  branch: number;        // increments on every genre jump
  recipe: PrintRecipe;   // frozen when the mark is made, so the print never changes later
  song?: { title: string; artist: string; artwork: string; previewUrl?: string }; // reveals only: a skip stays blind, even on the art screen
};
type Piece = { number: number; startedAt: number; marks: PieceMark[]; finishedAt?: number };
```

`addMark`, `markSaved` and `removeLastMark` keep today's rules, including 50 marks per piece, so the 50th finishes it and opens the art screen. Undo must survive that rollover: when the active piece is empty and the newest finished piece ends with the undone song, `removeLastMark` reopens that piece as the active one, minus the mark. Today's code (`hooks/use-art.ts` line 57) can't do that.

Storage moves to `art-canvas-v3` / `art-pieces-v3` in `hooks/use-art.ts`. On first load, v2 data is migrated: every v2 mark becomes a v3 mark (`bold` → `reveal`, `ghost` → `skip`, branch 0, recipe from the index or the cover fallback). Revealed marks get their `song` filled from swipe history or liked tracks by id where possible. Otherwise the art screen says "Older print — song details weren't kept". Existing pieces redraw as prints.

### Layout (`piecePositions(marks) → points`, pure)

A 1000×240 strip. One flowing line runs left to right through the marks in order, evenly spaced across the 50 slots. Each new branch shifts the line to another lane (up or down, alternating, staying inside the strip) with a smooth fork from the previous mark. The same marks always give the same layout.

- reveal = the song's still print (about 36pt on the phone)
- skip = a small grey ring on the line
- saved = a red (`signal`) outline ring around the mark
- the line itself is a fine cream stroke at low opacity, with grain

### On Home (`components/home/piece-strip.tsx`)

The strip sits under the action row. Label (mono): `4 PRINTS · TAP TO SEE YOUR PIECE`. Before the first swipe, the strip shows the empty line with a ghost slot and the label `YOUR FIRST SWIPE STARTS YOUR PIECE`. It is the same height in both states, so nothing shifts.

### Art screen (`app/art.tsx`)

It shows the piece large with the same renderer. Tapping a revealed print shows that song (cover, title, artist, play); tapping a skip says "Skipped — still blind". A list of the revealed songs sits below for accessibility. Export: the piece is drawn offscreen with Skia (`makeImageSnapshot`) to a PNG, then shared, because `react-native-view-shot` can't reliably capture a Skia canvas on Android. The export has no buttons or navigation in it.

## 9. Layout of Home

From the top: Undo · genre pill (unchanged) → the more-like-this note line (reserved height, empty most of the time) → the card → the action row → the piece strip → Tune · Liked → the credit line. `computeCardSize` gets the space left after the fixed rows, so the card shrinks on a small phone instead of pushing anything off screen. Check at 360, 375 and 390pt widths.

## 10. Errors and empty states

- Index miss + live lookup fails or is unavailable: the fallback print, with no sound facts on the card. Never a spinner on the card.
- Lookup in progress: the card starts on the fallback formation and morphs to the measured one when data arrives (within one breath, about 400ms).
- ReccoBeats 429: the session stops live lookups; index songs are unaffected.
- The cover fails to load at reveal: the blurred one stays, and title and artist still come in.
- No preview: the existing "nothing to play" path, unchanged.

## 11. Testing

Pure modules get Node tests (`node --experimental-strip-types --test`):

- `lib/sound-match.test.ts`: title cleaning, artist matching with accents, version rejection (live/remix), choosing among several recordings.
- `lib/sound.test.ts`: parsing ReccoBeats rows, `-1` → `null`, the index row format round-trip.
- `lib/print-recipe.test.ts`: determinism (same input, same recipe and same `settledPrint`), triads for major and minor, dyad and neutral formations, no violet hues, fallback with no data, visual tempo (70 and 140 the same).
- `lib/sound-neighbors.test.ts`: tempo octave tolerance, relative keys counting as close, unknown harmony rescaling, excluding the target's artist, fewer than n candidates.
- `lib/piece.test.ts`: the 50-mark rule, saved and undo, undo across the 50th-mark rollover, branch numbering, v2 → v3 migration (including song backfill), skip marks carrying no song, `piecePositions` staying inside the strip and being stable.
- `nearestBySound` (pure part, in `lib/sound-neighbors.ts` or tested through a catalog fixture): preset filtering and every exclusion set.

The UI gets checked in the web preview (headless Chrome, touch events, per the CLAUDE.md recipe; Skia on web needs CanvasKit loaded first via `LoadSkiaWeb`) for layout at 3 widths, the reveal sequence, the drag labels and the button row. Then an `expo-go` update for the phone: haptics, frame rate measured on Android, and audio and motion staying aligned through pause and seek.

## 12. Who builds what

- **Codex** (`codex exec`): the pure modules and their tests from this spec (`sound`, `sound-match`, `print-recipe`, `sound-neighbors`, `piece`). Claude reviews and runs them.
- **Gemini** (`agy`): `scripts/build-sound-index.ts` from section 1, then the index run in 50-minute chunks.
- **Claude**: the Skia renderer, the card, gestures, the reveal, the action row, the sheet, Home wiring, the art screen, migrating `song-feel-api`, and all verification.

## Risks

- **Index coverage** is about 80% on a 30-song sample. The fallback print has to look intentional, not broken.
- **Skia particle performance on a low-end Android phone** is unknown until measured.
- **Deezer's non-commercial limit** (see above).
- **Bundle size** from the index (estimated under 1 MB).
- **Home's `index.tsx` is 872 lines.** The new card, action row, strip and sheet go in `components/home/`, so the screen file gets smaller, not bigger.
