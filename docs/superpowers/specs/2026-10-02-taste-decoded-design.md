# Taste Decoded — design

**Date:** 2026-10-02 · **Status:** approved in chat, section by section (findings, data, screens, testing).
Picked from a brainstorm about features that bring people back; it is also the plan's unbuilt **gap reveal**
and **taste equation** (`plans/implementation-plan.md`, launch scope).

## What the listener gets
One honest sentence about their taste, backed by songs they can tap and hear:
"You don't hate country. You hate *happy* country."

- **You tab:** under the Tasteform, a **DECODED** line with the strongest finding and an arrow. Tap it to open
  the Decoded page. A new finding puts the red dot on the YOU icon (the one saves already use) and fades in
  the first time it's seen. Before there's enough evidence the line says what it needs instead.
- **Decoded page:** up to 3 findings, strongest first, each with a bar that shows where their songs sit,
  "Based on N songs", and **Sounds like me / Nope**. A **Share my taste** button at the bottom.
- **Sunday:** the existing 6pm weekly reminder says "New finding about your taste" when there's one they
  haven't opened yet.

## Findings

### The 8 measurements
From ReccoBeats (`POST /v1/analysis/audio-features`, already used by `hooks/use-song-feel.ts`). Checked
2026-10-02 on one Daily Drop clip: it returns acousticness, danceability, energy, instrumentalness, liveness,
loudness, speechiness, tempo, valence. Findings use 8 of them; **tempo stays out** (shaky on 30s clips, see the
Tasteform spec). Each measure has two words, one per side:

| Measure | Low side | High side |
|---|---|---|
| energy | calm | intense |
| valence | sad | happy |
| danceability | still | danceable |
| acousticness | electronic | acoustic |
| instrumentalness | vocal | instrumental |
| liveness | studio | live |
| speechiness | sung | rapped or spoken |
| loudness | quiet | loud |

### Low, normal, high
Every measure is judged against **that genre's normal**, not a fixed number, using the baselines file below.
A song is **low** at or below the genre's 25th percentile, **high** at or above its 75th, otherwise normal.
"Across everything" uses the all-genres row of the same file.

- A song's **position** on a measure is its percentile within its own genre, read straight-line between the
  stored cut points (10/25/50/75/90); below the 10th it's 5, above the 90th it's 95. A value equal to several
  cut points (say instrumentalness 0 where most of a genre is 0) takes the middle of those percentiles, so a
  typical value never reads as extreme. This is what lets songs from different genres sit on one bar, whose
  normal band is always 25–75.
- **"On the same side"** means all low or all high; normal songs never count toward a side.
- A **measured** song has all 8 measurements.

### Three kinds
| Kind | Speaks when | Example |
|---|---|---|
| **Never, decoded** | The Blind Spot Test result has its songs (below), at least 2 "never" songs were liked and at least 1 skipped, and on some measure every liked never-song sits on one side of every skipped one, with the gap between their averages at least 25 percentile points. | "You don't hate country. You hate happy country." |
| **Never, decoded (all liked)** | Same, but all 5 never-songs were liked and at least 4 of them are on the same side for one measure. | "You said never metal, then liked all 5. Every one was instrumental." |
| **Genre twist** | 3+ measured saves in one genre, and at least 75% of them are on the same side for one measure. | "You don't just like jazz. You like loud jazz." |
| **Across everything** | 6+ measured saves across 3+ genres, and at least 75% of them are on the same side for one measure. | "Six genres, one habit: almost everything you save is acoustic." |

- In Never, decoded, "sits on one side" and "the gap" use positions (above), and the word in the sentence is
  the **skipped** songs' side: liked songs sad, skipped ones happy → "You hate happy country."
- When the never-songs span several genres, the sentence names them ("country and metal").
- **Strength** (for ranking): the share of songs on the winning side, times `min(n, 8) / 8`. Never, decoded
  always ranks first when it speaks, since it's the headline.
- **At most 3 on the page**, and no two may use the same measure.
- A finding's **id** is `kind:genre:measure:side`. It drives "new" (an id not in the seen list), votes and the
  Sunday ping.
- **Before anything speaks**, the line says, in this order: "Take the Blind Spot Test to decode your nevers"
  (if there's no test result with songs; tapping it opens the test), else "Save N more songs to decode your
  taste" (fewer than 3 saves; counted as saves, not measured saves, so it never asks for more while measuring
  catches up), else "Keep saving. Nothing stands out yet."
- **Only the strongest** Never, decoded finding is shown; it's the headline.

## Data
Everything stays on the phone. The only thing sent out is each song's public preview clip, as today, plus
anonymous votes (below).

1. **All 8 measurements kept.** `SongFeel` (`lib/tasteform.ts`) gains `danceability`, `acousticness`,
   `instrumentalness`, `liveness`, `speechiness`, `loudness`, all optional for old cache entries. A cached song
   without `danceability` counts as unmeasured and is measured once more under the existing limits (2 at a time,
   80 per session, stop on a 429).
2. **Genre baselines**, `assets/genre-sound.json`, built once on the Mac by `npm run measure-genre-sound`
   (`scripts/measure-genre-sound.ts`, dev-only). It takes 30 songs per genre from `assets/catalogs/*.json`
   (15 hits, 15 deep cuts, at most 2 per artist, seeded so it's repeatable), downloads each preview, and sends
   it to ReccoBeats **one at a time, 3 seconds apart**. It keeps going across restarts, the same way
   `resolve-itunes-ids` does, and stops cleanly on a 429. It writes, for each genre (keyed by the same genre names
   the swipe log uses) and for an `all` row: the number of songs and each measure's 10th, 25th, 50th, 75th
   and 90th percentile. About an hour for ~1,100 clips.
   - **Sanity check** at the end; if any fails, the file isn't written: Metal is louder than Ambient,
     Classical is more instrumental than Hip-Hop, Hip-Hop is more spoken than Classical, Ambient is calmer than
     Metal (all compared on the 50th percentile).
3. **Swipe log keeps the audio link.** `SwipeEntry` gains optional `previewUrl` and `artworkUrl100`, set
   at swipe time. Nothing reads them yet; they are the data for skip findings later.
4. **Blind Spot Test keeps its songs.** `BlindTestResult` gains optional `songs`:
   `{ trackId, title, artist, genre, previewUrl, artworkUrl, isNever, liked }[]`. The 10 songs are measured
   right after the test ends, through the same measuring code and limits. Old results have no `songs`, so
   Never, decoded stays quiet and the line asks for a retake.
5. **A saved song's genre** is the first of its swipe-log entry's `genre` and its own `primaryGenreName` that is
   one of the baseline genres. Pool songs carry the app's genre names ("Country"); songs from the older fetch
   path, search or charts carry iTunes labels ("Hip-Hop/Rap") and usually match nothing. Songs without a genre
   still count toward Across everything. A genre with fewer than 15 measured baseline songs is left out of the
   file, and its songs are placed against the `all` row.

## Code
- **`lib/taste-decoded.ts`** (pure, no network): saved songs, measurements, genres, baselines and the test
  result in → ranked findings out, each with id, sentence, measure, side, the genre band (25th–75th) and its
  evidence songs with their percentile positions. Same pattern as `lib/saved-songs.ts`.
- **`hooks/use-taste-decoded.ts`**: loads the inputs, measures what's missing (via `use-song-feel`'s measurer,
  shared with the Blind Spot Test), returns findings plus `isNew`, and records ids as seen when the page opens.
- **`app/decoded.tsx`**: the page. **`components/decoded/`**: the You tab line, a finding card with its bar,
  and the share card.
- **Votes:** `supabase/decoded-votes.sql`, a `decoded_votes` table (`kind`, `measure`, `side`, `agree`,
  `created_at`; no device id, no user id). Phones can insert only, with length checks, the same way `vibes`
  works. A count view readable only by the server key, for the paper. Each finding id is sent at most once per
  phone (remembered locally); tapping the other button changes only the local state.
- **Sunday ping:** `lib/nudge.ts` gets a way to reschedule the same `NUDGE.id` with new text (cancel, then
  schedule: Expo's docs don't promise that reusing an id replaces it). With an unseen
  finding: title "New finding about your taste", body the finding's sentence, opens `/decoded`. Once it's
  seen, it goes back to the Called it text. It never asks for notification permission itself; that stays with
  the first blind like.

## Screens
- **Decoded line** (You tab, under the Tasteform's breathing sentence): mono **DECODED** label, the sentence in
  text type, a chevron. The whole row is one big tap target.
- **Finding card:** a mono number, the sentence in the display font, then the bar: the two side words at the
  ends (sad ←→ happy), the genre's normal band shaded, and the evidence covers sitting at their percentile
  spots. On open, the covers slide out from the middle into place, with the same animation tools the Tasteform
  uses. Tap a cover to play it on the shared player. Under the bar: "Based on 4 songs" and two outline buttons,
  **Sounds like me** and **Nope**.
- **Share my taste:** the page's one filled cream button. The card it shares (top finding in big type, up to 3
  covers, "Decoded by Blindspot" and the date) sits right above it as a preview, so what you see is what gets
  sent; it's captured with `react-native-view-shot` and shared with
  `expo-sharing`, like the Song prints poster. **No new native modules**, so it can ship as an update to the
  runtime 1.0.1 APK.
- Theme rules as everywhere: navy room, cream text, red only for the dot; no emoji.

## Testing
- `lib/taste-decoded.test.ts` (Node's test runner): each kind speaks exactly at its bar and stays quiet one
  song below it; the 25-point gap rule; all-liked variant; ranking and the 3-finding, one-per-measure cap;
  old data (no new measurement fields, no test songs, no genre) never throws; the before-anything messages
  in order; multi-genre never wording.
- The baselines sanity check (above).
- On a phone via the `expo-go` update recipe, with a test account that has saves and a fresh Blind Spot Test.
- `npm run lint`.

## For the paper
- The votes give an agreement rate per kind of finding ("testers agreed with 7 of 10 Never, decoded").
- The sanity check shows the measurements mean something before any finding relies on them.
- Fits **P5 (10/8), debugging & instrumentation**: the votes and the measuring logs.

## Risks
- **Noisy measurements on 30s clips.** Covered by the sanity check and by "Based on N songs".
- **Small samples.** The bars above; nothing speaks on fewer than 3 songs.
- **ReccoBeats limits aren't published.** The baselines run is the only batch, paced and resumable. If the
  service stops answering, findings stay as last computed.

## Not in this version
Musical key and major/minor (needs Essentia on a server, see the 2026-09-17 sound-space spike), skip
findings (their data starts collecting now), Finds News, before-they-blew-up receipts, Twin Bridges, the mood
dial and smooth mode.
