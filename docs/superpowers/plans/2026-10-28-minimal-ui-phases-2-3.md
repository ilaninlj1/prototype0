# Minimal UI, Phases 2 and 3 Plan

**Goal:** Finish the Library tab (phase 2), then turn the sheets light and sentence case and bring every other screen onto the light tokens (phase 3), plus Apple Music–style hide-on-scroll on Library, Play, You and search (added by the student on 2026-10-28). Phase 4 (playlists, Send to Spotify) is not part of this.

**Spec:** `docs/superpowers/specs/2026-10-21-minimal-ui-design.md`. Conventions from `docs/superpowers/plans/2026-10-21-minimal-ui-phase-1.md`.

**Branch:** `minimal-ui-2` off `sdk-58` (0d9b833), worktree `~/Desktop/prototype0-minimal2`. Never merged or pushed.

## Global constraints

- SDK 58, version 1.0.5. No new native modules, no `package.json` changes.
- The discovery engine, queue, sound and map data, game rules and Run mode's sensor logic stay as they are. Swipes, Undo, the action lock, crossfade, reveal, Call it, the piece, Finds News, Editions, Dark Map steering, feed loading, the games, You and Run keep working.
- Dark on purpose: the Edition reel, the Dark Map, Rewind, the blind card (Home's and the games' `CardFace`), and Run mode's black live screen. Anything that draws a sound print sits on a dark tile.
- Small text is 4.5:1 or better on the background and on the grey surface.
- Labels are sentence case Figtree; DM Mono only for numbers. No emoji, no violet.
- Hooks that read module stores use `useSyncExternalStore`; Skia stays in lazy `*-canvas.tsx` files.
- Each commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Tasks

### 1. Theme: sentence-case labels, rounder buttons, small-text contrast
- `Typography.eyebrow` and `Ui.label` become sentence-case Figtree semibold; `Ui.outlineButton` becomes a pill. The dark rooms keep today's mono uppercase through `DarkTypography` and `DarkUi` (ThemedText picks the dark set inside a `DarkRoom`).
- `textTertiary`, `positive` and `destructive` get shades that pass 4.5:1 for small text; `signal` stays for the heart, saves and big numbers.
- `LightRoom` lets a light sheet open over a dark room.
- Tests in `constants/theme.test.ts`: every small-text token passes on background and surface; the dark set is unchanged.

### 2. Hide-on-scroll (Library, Play, You, search)
- `lib/scroll-chrome.ts` (pure, worklet-safe, tested): `scrollChromeStep(state, sample)` hides after scrolling down 40 pt past the turning point, shows after 24 pt up, a fast flick up, near the top, at the end of the list, when the list is too short to scroll, or while pinned (screen reader, sheet, typing). `tabBarScrollShare(route, hidden)`: Home's own layer owns the tab bar on Home, the scroll rule owns it everywhere else, so the two never fight.
- `hooks/use-scroll-chrome.ts`: a Reanimated scroll handler on the UI thread, a quick spring (none with reduced motion), a sliding top-bar style, and a shared value the tab bar reads. Focus and blur bring everything back.
- `hooks/use-screen-reader.ts` is shared with Home's hook.
- The top bars are overlays over padded scroll content, and the tab bar keeps its slot, so nothing shifts.

### 3. Library tab finished (phase 2)
- `lib/library.ts` (tested): `searchLibrary` (song, artist or album, case and accent blind), `libraryView` (search + genre chip, newest first), `foundLine` ("Found at 97.3K → now 98.6K", "Found at 98.6K · today").
- `LikedTracksScreen`: the hiding top bar holds the title, Look up and Select, and the search field "Songs, artists or albums". Under it: the best find and calls card, genre chips, a two-column cover grid (title, artist, found line, the call tag, the note), links to Export history and Recently deleted, credits. The shared player keeps notes and steering Home. Search with no match offers the full search (`/search?q=`).
- Empty state: "Nothing saved yet. Double-tap a song you love to keep it here." with Start listening (to Home); no stats.
- `/modal` keeps redirecting to `/library`, and the weekly nudge goes straight to `/library`.

### 4. Core-flow sheets light and sentence case (phase 3)
- One sheet frame (`components/ui/sheet.tsx`: backdrop, white top sheet with 28 pt corners and a grabber) used by Details, Tune, the genre picker and Finds News; the note and Spotify sheets get the same light card.
- Details: cover, title, artist and release line, Listen on (Apple Music, Spotify, Last.fm), listeners with a gem-to-popular meter, the sound as tiles, the Call it card, Sounds like AI, Comments, credits.
- Tune: a live summary on top, How well-known, What plays next, Sound, then More (store region, AI-made music, test network) folded; Reset sound and Done.
- Genre picker: header with the count, Shuffle, a genre search, grouped rows.
- Credits: the Spotify and Last.fm icons go black on light (white inside dark rooms).

### 5. Play and the games
- Play scrolls (so short phones reach the button) and its tab bar hides on scroll; the games and their result screens follow the light tokens. `CardFace` stays dark like Home's card. Gold stickers and tags get black text.

### 6. You, search, song and the rest
- You: the hiding top bar holds the title and the Piece / Discoveries / Insights switch. Cards, iceberg, story, Decoded, Tasteform, charts, comments, twins, song, songs, art, export history, recently deleted, the feed status panel and the native headers follow the light set.

### 7. Run mode
- Setup, the reveal and Past runs go light; the pace line and route stay on dark tiles. The live screen stays black with a light status bar.

### 8. Docs
- `CLAUDE.md` (Theming, Library, the sheets, hide-on-scroll), `changelog.md`, `features.md`.

### 9. Checks and phone build
- `npx tsc --noEmit`; `node --experimental-strip-types --test $(git ls-files '*.test.ts')`.
- Web check at 390 pt (single output, landing gate off, both reverted exactly): Library (unscrolled and scrolled), Play, You, Details, Tune, into `~/Desktop/blindspot-ui-before-after/phase-2-3/`.
- `eas update` to branch `expo-go` only, QR at `~/Desktop/blindspot-minimal-p23-qr.png`.
