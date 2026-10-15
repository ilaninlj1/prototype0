# The Dark Map — design

2026-10-15. From the Dark Map idea of 2026-10-08 (blindspot-project notes) and the 2026-10-14 "what should I add"
talk. Layout and flow picked with real renders in the brainstorm companion; claims left for later by the user.

Every measured song in the app sits on one map, placed by how it sounds. Songs you've heard light up; everything
still dark is your blind spot. Tap somewhere dark and Home plays you unheard songs from there, blind.

## Why, and what counts as working

- **The showcase moment (Dec 3):** someone swipes for a minute, opens the map, and sees their own light spread
  across a dark map. It should read without explanation.
- **A reason to come back:** the lit share ("47% LIT") only grows, and new lights bloom when you return.
- **The paper:** two honest numbers. How much of the map testers lit, and whether songs reached through the
  map get saved more or less often than songs from ordinary genre swiping.

Success: a showcase visitor understands it in one look; testers' lit share rises over a week; map-served songs
are tagged so the save comparison can be computed from exported history.

## What you see

1. **Open the map.** Home's bottom row becomes `TUNE | MAP · 47% | LIKED`. You → Discoveries gets a Dark Map
   card at the top (a still of your map and the lit share). Both open `app/map.tsx`, full screen like Rewind.
   - Top bar: back, `DARK MAP`, `47% LIT`.
   - The map: unheard songs as dim dots, heard songs as cream dots with a soft glow around each, saved songs red.
     Region names in DM Mono caps (`INSTRUMENTAL · GROOVY`), cream where you've heard some of it, dim where
     you've heard almost none.
   - A legend row (`● HEARD ● SAVED ● NOT YET`) and one line: "Tap anywhere dark to go there."
   - Pinch to zoom (1× to 4×) and drag to pan; double-tap toggles 1× and 2.5×.
   - Lights that are new since your last visit bloom in (fade up with a small ring, 600ms), then the visit is
     remembered. On the first visit every light blooms.
2. **Tap somewhere.** A dashed ring (radius 0.08 of the map's width) marks the spot and a sheet slides up:
   the spot's region words, "N songs around here", "You've heard M of them", and a cream `SWIPE BLIND HERE →`
   button. Where you've heard more than 80% of the ring, the sheet says "You know this part." and still offers
   the button. Tapping empty sea (no songs in the ring) shows "Nothing here. Tap where the dots are." instead.
3. **Swipe blind there.** The map closes to Home, which plays unheard songs nearest the tapped spot, from any
   genre, still blind. A note line above the card says `IN THE DARK · INSTRUMENTAL · GROOVY ✕`. The `✕`, a genre
   jump or picking a genre leaves; Undo goes back to the queue and genre from before the jump and leaves the dark.

## The map data

### Topping up the sound data first

Only 5,559 of the 10,889 catalog songs (51%) have sound data, because the catalogs grew after the index was
built. Before the final map, run `npm run build-sound-index` in its usual 50-minute chunks until it stops finding
new matches. The last full run matched 76% of songs, so expect about 8,000. This is a data run, not code, and the
map works at today's 51% in the meantime.

### `scripts/build-sound-map.ts` → `assets/sound-map.json` (dev only)

- Reads `assets/sound-index.json`. Uses eight measures: energy, danceability, acousticness, instrumentalness,
  speechiness, valence, loudness, tempo. A `-1` (missing) value is replaced by that measure's mean. Each measure
  is standardized (z-score); the means and standard deviations are saved with the map.
- Lays the songs out with UMAP (`umap-js` 1.4.0 as a devDependency, never imported by the app), 15 neighbors,
  minimum distance 0.02, seed 42, then scales both axes to 0–1. These settings gave the clearest islands in the
  brainstorm renders: a vocal continent and a separate instrumental island.
- **Regions:** k-means on the layout (k = 8, seeded). A region with under 60 songs merges into its nearest
  neighbor. Each region gets two plain words from the two measures its songs differ most on from all songs
  (loudness skipped, it repeats energy): calm/loud, loose/groovy, electric/acoustic, sung/instrumental,
  melodic/wordy, dark/bright, slow/fast. Two regions with the same words get a third word.
- **Genre:** each song keeps the genre tag `loadCatalog` uses ("Hip-Hop", not "hip-hop"). The script maps catalog
  file names to tags with the same slug rule as `scripts/precompute-catalogs.ts`.
- **File:** `{ v: 1, builtAt, settings, measures, mean, sd, genres: string[], regions: [{ x, y, words, songs }],
  songs: { [itunesTrackId]: [x, y, regionIndex, genreIndex] } }`, coordinates to 3 decimals, about 230 KB at
  8,000 songs. `npm run build-sound-map` writes it.
- **Stability:** the layout is frozen in the asset and only changes when the script is run on purpose. Nothing
  on the phone stores map coordinates (only song ids), so a rebuild just re-places the lights.
- **Loading:** `lib/sound-map.ts` requires the asset on first use, like the catalogs, so app start isn't slowed.

### Placing songs that aren't in the map

A song you heard on Home that isn't in the index may still have sound data, measured live and cached in
AsyncStorage (`blindspot:sound:v1`). It's placed at the average position of its 5 nearest map songs in the same
standardized eight-measure space, in the region most of those 5 share. A heard song with no sound data at all
isn't drawn; the map's footer counts it ("12 songs you heard aren't on the map yet") so the lit share stays
honest.

## What lights up

- A song is heard if it has a skip, like, reveal or genre-jump entry in swipe history (the same rule as
  `countSongsHeard`), including Daily Drop plays.
- **Brightness:** `clamp(listenMs / 24000, 0.25, 1)`, the longest listen across its entries. 24 seconds is 80% of
  a preview, the same "fully heard" point as the piece's prints. A two-second skip still counts, dimly. An entry
  from before listen times were recorded (no `listenMs`) counts as 0.5.
- **Saved** (in liked tracks, including saves from before this feature): full brightness, drawn red.
- **Glow:** each heard song lights a soft disc of radius `0.035 × (0.6 + 0.4 × brightness)` map widths.
- **Lit share:** the map is cut into a 24 × 36 grid. Lit share = cells holding at least one heard song ÷ cells
  holding any song, shown rounded (`47% LIT`). Unmapped heard songs don't count toward it.

## Jumping into the dark

- `lib/steer-request.ts` gains `{ kind: 'map'; point: { x, y }; words: string }`. Home takes it on focus like the
  existing requests: it captures an undo snapshot, sets `mapFocus` (in memory, not saved), empties the queue and
  refills from the map.
- **Picking songs** (`getTracksNear` in `lib/pool.ts`): sort map songs by distance to the point; drop songs
  already heard, artists seen this session, and anything `hideFromDiscovery` or `alreadyKnown` would drop
  (human-only, artists already in your Spotify file); take the nearest `3 × deckSize`, shuffle, keep `deckSize`.
  Tracks are built with `catalogTrack`, loading only the catalogs of the genres those songs come from; a song
  whose artist is missing from the genre seed is skipped. Since the search always takes the nearest unheard
  songs, it widens by itself as a spot runs dry.
- **Popularity:** the Tune preset is ignored while in the dark. The map is about sound, and a preset would empty
  most spots.
- While `mapFocus` is set, every refill comes from `getTracksNear`. More like this still inserts its three
  nearest-by-sound songs, then the queue goes back to the map.
- **Tagging:** swipes on map-served songs are logged with `source: 'map'` (`SwipeEntry.source` becomes
  `'drop' | 'map'`), so saves per map song can be compared with saves per genre song.
- Leaving (`✕`, a genre jump, the genre picker, or artist steering) clears `mapFocus`, and refills go back to the
  current genre. Undo restores the snapshot taken before the jump, which has no `mapFocus`.

## Accessibility

The map screen has a `LIST` toggle next to `47% LIT`. It shows the regions, least heard first, as buttons with
whole-region counts (the sheet counts only its ring): "Instrumental · groovy. 3 of 802 heard. Swipe blind
here." Each does what tapping that region's center does.
VoiceOver reads the top bar and lit share. This is part of P10's audit (11/12).

## Drawing

- `components/map/dark-map-canvas.tsx` (Skia, loaded through `lazySkia` like the prints): the dim dots are one
  path built once per map load; the glow is one path of discs drawn with a `BlurMask`; heard dots and red saves are
  two more paths; labels use Skia's DM Mono typeface, as the Edition does. Pan and zoom move one `Group` transform
  from gesture shared values, so the paths are never rebuilt while you move.
- Tap: the screen point goes back through the inverse transform to a map point, then to the sheet.
- The bloom: the set of lit song ids from the last visit is stored at `blindspotDiscovery:mapSeen`. On open, lit
  songs not in it animate in; the set is saved when the bloom ends.

## Files

- New: `scripts/build-sound-map.ts` (+ `npm run build-sound-map`), `assets/sound-map.json`,
  `lib/sound-map.ts` (loading the map, placing songs, regions, nearest songs), `lib/dark-map.ts` (brightness,
  lit share, new lights; pure), tests for both, `app/map.tsx`, `components/map/dark-map.tsx` (lazy) +
  `dark-map-canvas.tsx`, `components/map/spot-sheet.tsx`, `components/map/region-list.tsx`.
- Changed: `app/(tabs)/index.tsx` (`mapFocus`, refill path, note line, the `MAP` button), `lib/steer-request.ts`,
  `lib/discovery.ts` (`SwipeEntry.source`), `lib/pool.ts` (`getTracksNear`), `app/(tabs)/explore.tsx`
  (the Discoveries card), `app/_layout.tsx` (the `map` route, full screen), `package.json` (`umap-js` dev
  dependency, the script), `CLAUDE.md`, `features.md`, `changelog.md`.

## Testing

- `lib/dark-map.test.ts`: brightness from listen time and saves, lit share on a small hand-made grid, new-light
  diffing, unmapped songs left out of the share.
- `lib/sound-map.test.ts`: placing a song from its 5 nearest neighbors, region majority, `getTracksNear` order and
  filters (heard, seen artists, hidden artists), behavior when a spot runs dry, standardization with the stored
  mean and sd.
- `build-sound-map`: the same seed gives the same file; every song lands in 0–1; every region has words.
- In the app: the web build check (map renders, tap → sheet → Home in the dark → ✕ leaves; Undo returns), then a
  phone build. On the phone: pinch smoothness with about 8,000 dots, and the bloom.

## Not in this version

- Claims (the first to save an artist in an area owns it). That needs a shared database and enough players.
- Tilt, sensors, or anything native, so no new APK.
- Placing songs that have no sound data.
- Popularity presets on the map.
