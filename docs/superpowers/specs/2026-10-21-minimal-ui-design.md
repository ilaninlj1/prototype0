# Minimal UI — design

Date: 2026-10-21. Branch `minimal-ui`, cut from `dark-map` (e790e84). Worktree `~/Desktop/prototype0-minimal`.

## Why

This is the student's "UI change" for class, built into the real app, not only mocked up. It comes out of a FigJam review of the current app against Swipefy. The current Home has too many small banners and labels competing with the blind card. The Liked list looks like a different app from the rest. Blindspot's edge — blind-first discovery, real genre range, a profile about taste and not achievements — should be visible in the flow itself.

Where the design came from (read these first):
- `docs/figma-make-core-flow-prompt.md` (copied into this branch): the full core-flow spec. It covers screens, gestures, the saved moment, the Library, the sheets and the rules. Where it and this document disagree, this document wins.
- The mockup canvas at https://claude.ai/artifact/KE1tMXyvsXvn6BB82ZDss8. Its **Minimal** page is the approved look: `M0-try` is a clickable demo of the hiding buttons, and `M1`–`M4` are stills of each moment. Its **Simpler** page shows the light look the student picked, "2 · Clean".

## Decided by the student

- **Look:** "Clean" (Simpler page, v2), made minimal. That means a white background, black text and light grey surfaces. Black is the only strong color. Lots of empty space. Round icon buttons with a small grey label under each; the main action is a bigger black circle.
- **Whole app goes light.** Only the full-screen experiences stay dark on purpose: the Edition reel (`app/edition.tsx`), the Dark Map (`app/map.tsx`) and Rewind (`app/rewind.tsx`).
- **The blind card stays dark.** The live sound print, particles and song-age colors stay exactly as they are, inside a dark rounded card. It's the one dark thing on a white screen, like an album cover.
- **Buttons hide and come back.** See "The hiding buttons" below. The student tried the M0 demo and said it looks good.
- **Library becomes its own tab:** Home · Play · Library · You.
- **Build on `dark-map`.** The MAP button is part of the new Home.
- **Playlists and Send to Spotify are the last phase.** They come after the redesign works.
- Carried over from the prompt work: swiping right means "More like this" plus a reveal, and it doesn't save. Double-tap saves; on a blind card it reveals and saves in one go, which is today's behavior. Songs save in Blindspot first, and Spotify is always optional.

## Goals

1. Home shows only the card and its clues while you listen. Everything else is one tap away.
2. One consistent light look across every screen except the three dark experiences.
3. The Library is a real tab that matches the rest of the app.
4. Nothing that works today breaks: swipes, Undo, the action lock, crossfade, reveal, Call it, the piece, Finds News, Editions, Dark Map steering, feed loading states, the games and You.

## Non-goals

- No changes to the discovery engine, queue, pool, sound data, map data or game rules.
- No new native modules. Every phase must ship as a JS update to the 1.0.3 APK and Expo Go.
- No new features before the last phase, apart from the hiding buttons and the Library tab.

## Anti-goals: a failure even if it technically works

- A new user lands on a blank-looking screen and can't figure out what to do.
- The print, particles or song age look washed out or wrong.
- Half the app is light and half is navy in a build that reaches class testers. The student's own phase checks may show unfinished screens. Nothing goes to testers until phase 3 is done.
- Screen-reader users can't reach the buttons.

## The light theme

- `constants/theme.ts` gets light values for the shared tokens. Most screens follow automatically, since about 80 files import them. A starting point:
  - background `#FFFFFF`; surface `#F2F2F2`; elevated surface `#FFFFFF` with a hairline
  - text `#111111`, secondary `#6B6B6B`, tertiary `#8A8A8A` for large text only
  - accent `#111111` with white text (buttons and selected states)
  - hairlines and rules as black at low alpha
  - signal red `#E63946`, kept for the heart, saves, streaks and big numbers only

  Small text must stay at 4.5:1 or better.
- **A second, dark token set** (today's navy values) is used by the blind card, the cards stacked under it, anything that draws a sound print (piece tiles, posters, the flying print), and the three dark experiences. Prints are always drawn on a dark ground.
- The status bar turns dark on light screens and stays light on the dark experiences. The navigation theme goes light.
- The 13 files with hardcoded hex colors get checked. Most are Edition files and stay dark; `components/credits.tsx`, `components/home/feed-status.tsx` and `components/you/you-cards.tsx` need light versions.
- Fonts stay as loaded: Figtree for text, Archivo for big titles, DM Mono only for numbers. On Home and in the core-flow sheets, labels become sentence case. The walls of small uppercase mono text go away.

## Home

Top to bottom:

1. **One status line.** It shows at most one item, in this order of priority:
   1. a failed load ("Couldn't load more songs · Try again"), which always stays visible
   2. an Edition ready to play
   3. "While you were gone: N updates" (Finds News)
   4. "In the dark · …" with ✕ (map focus)
   5. "More like this: …"
   6. "Sorted: …"

   Tapping it opens the item's existing destination. This line replaces both the separate news strip and the note line.
2. **Top bar.** On the left, the genre pill (`GenrePicker`). On the right, three icon buttons: Map (keeps its lit %), Tune (opens `TuneSheet`) and Undo. Daily Drop's ring leaves Home and becomes a small mark on the Play tab when today's drop hasn't been played. *(My call.)*
3. **The dark card,** with the stack under it, exactly as today. Its own mono labels (PRINT n/50, the clock, BPM · key, tier) come off the card face.
4. **Under the card,** while blind: "Just listen." and one grey line: "104 BPM · E minor · Close to home". Plus a thin progress line or the clock. When revealed: the title, the artist with the release line, and the listener count, with Call it nearby. The card shows the cover. Follow M4.
5. **Action row:** round buttons with labels. Blind: Skip / New genre / More like this, with the main one bigger and black. Revealed: Save / Details / Next.
6. **Piece strip.** It carries the "n/50" count.
7. **Credits line.** Required by the iTunes and Last.fm terms, and also in Details.

The Liked button leaves Home, because the Library tab replaces it.

## The hiding buttons

- **What hides:** the status line (unless it's showing a failure), the top bar, the action row, the piece strip, the credits, the tab bar and the corner pause button. What never hides: the card, the clues under it, the drag label and the feed status panel.
- **Hiding:** a 250 ms fade, with no layout movement. Hidden controls can't be tapped. With reduced motion on, they switch without the fade.
- **They hide** after 3 seconds without a touch.
- **They show and stay** while any of these is true:
  - it's one of the user's first 5 songs (count stored on the device)
  - the clip ended (until the next action)
  - the feed status panel is up (loading or failed)
  - a sheet is open
  - a screen reader is on
- **They show for 3 seconds** after a tap on empty space or after any button press.
- **Tapping the card** shows or hides them. Pause therefore moves to a small round button on the card's top-left corner, inside the hiding layer. The double-tap to save and the drag gestures stay as they are.
- **While hidden,** one grey line near the bottom says "Tap anywhere for buttons · swipe the card to choose". When the card is revealed, it says "Double-tap to save · swipe for the next song".

## Saved moment

- The heart lands, Save turns into Saved, and the save flight lands on the **Library** tab instead of You.
- A toast slides up: "Saved to Liked Songs", with a "View Library" button. A "Send to Spotify" button is added in the last phase. The toast hides after 4 seconds and never blocks Details or Next.
- The Library tab shows a +1 badge until it's visited.

## Library tab

- `app/(tabs)/library.tsx` takes over everything `app/modal.tsx` does today: the list, notes, Recently deleted, export and Export history, growth since found, the best find and calls summary, steering Home from a song, and the shared player. It also adds:
  - search ("Songs, artists or albums")
  - genre chips
  - a two-column grid of covers, each with title, artist and "found at X → now Y"
- Empty state: "Nothing saved yet. Double-tap a song you love to keep it here." with a button that goes to Home.
- Any old link to `/modal` must land in the Library. The builder chooses how.

## Sheets and the rest of the app

- **Core-flow sheets** go light and sentence case: Details, Tune, the genre picker, Finds News, the note sheet and the Spotify sheet.
- **Every other screen** follows the light tokens: Play and its games, You, search, song, art, export history, recently deleted, the Blind Spot Test, Blind Pack, DJ Picks, twins, comments, charts and decoded. Anything that draws a sound print keeps it on a dark tile.
- **The three dark experiences** stay as they are.

## Last phase: playlists and Send to Spotify

- **In-app playlists,** stored on the device: create, add songs from Liked, open, remove a song, delete a playlist.
- **Send to Spotify,** for one song or a whole playlist, using the existing Spotify login with playlist-write permission added. The first time, it asks you to connect. Songs are matched by artist and title, and a song that can't be matched gets a plain message. It's limited to the 5 Spotify accounts development mode allows. Cancel always keeps the Blindspot save.
- **Where songs go** *(my call)*: the Send sheet lists your own Spotify playlists plus "+ New playlist", as in the prompt. Sending a Blindspot playlist starts on "New Spotify playlist named the same". Sending again only adds songs that aren't already there and says how many were already in it.
- **Playlist membership** *(my call)*: a playlist keeps its own copy of each song. Removing a song from Liked Songs doesn't take it out of playlists, and Recently deleted and restore only affect Liked Songs. Exporting never removes anything.

## Phases

Each phase ends with a check, then the student tests it on a phone. Nothing is merged or pushed without the student.

1. **Light tokens, Home, tab bar, toast.** The four tabs go in, with a minimal Library tab that just moves today's list in.
2. **The Library tab, finished.**
3. **Sheets and a full pass over the rest of the app.**
4. **Playlists and Send to Spotify.**

**Checks for every phase:**
- `npx tsc --noEmit` is clean.
- All tests pass: `node --experimental-strip-types --test $(git ls-files '*.test.ts')`.
- The rules for when buttons show become a pure, tested module.
- A web preview check at 390pt.
- An Expo Go update group plus QR for the phone test.

## Calls Claude made (for the student to check)

- Daily Drop's ring moves from Home to a mark on the Play tab.
- One status line replaces the news strip and the note line, using the priority order above.
- The hiding rules: show for 3 s after a tap, stay up for the first 5 songs, when the clip ends, while a sheet is open, while loading or failed, and with a screen reader on.
- The credits line lives in the hiding layer and in Details.
- The Send to Spotify destinations and the playlist membership rules above.

## Left to the builder

The exact token values (within the contrast rule), the icons, the motion curves, how the card's labels move below it, how `/modal` redirects, the storage keys, the component structure, and how the work is split between Claude, Codex and Gemini.
