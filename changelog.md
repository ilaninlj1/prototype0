# Changelog

Notable changes to this project, logged as dated entries. Unlike `bugs.md` and `features.md`,
this file is a record of what shipped, not a queue of open items — it is not scanned for
staleness.

Add new entries at the top, newest first.

## [2026-10-28] Bottles: blind saves float to strangers
A save on Home of a song you found blind and heard for 10 s or more floats to a stranger as a bottle. At most one card
in five on someone else's Home is a bottle, blind like any card; the reveal says "Washed up from Lisbon" where the
release line was. Keeping it shows "You're the 7th person to keep this. It's floating on.", the cities it passed
through and its print: the song ringed by one ring per keeper, colored by the song that keeper saved just before.
Five passes in a row sink it. The first save asks "Use my city" or "Not now" (a time-zone region instead), then offers
to float up to 30 old blind finds. Finds News reports where your finds went; Library covers with a bottle get a wave
mark that opens the journey; Tune → More → Bottles turns it off. Server `supabase/bottles.sql`, simulated in
`supabase/bottles-sim.mjs` (40 checks).

## [2026-10-28] Minimal UI phases 2 and 3: the Library finished, light sheets, the whole app light, hide-on-scroll
The Library tab (`components/library/liked-tracks-screen.tsx`) has a top bar with the title, Look up (the full
search, now `/search?q=`) and Pick, and a search over your saves ("Songs, artists or albums", `lib/library.ts`:
title, artist or album, any case or accent), genre chips, the best find and calls card, and a two-column cover grid
with "Found at 97.3K → now 98.6K" (or "· today") under each cover. Empty, it says "Nothing saved yet. Double-tap a
song you love to keep it here." with Start listening. The weekly nudge opens `/library` directly; `/modal` still
redirects. Details, Tune, the genre picker and Finds News share one light bottom sheet (`components/ui/sheet.tsx`);
Details gained Listen on, a gem-to-popular meter, a Call it card and sound tiles; Tune a live summary and a folded
More; the genre picker a count, Shuffle and a search. The note and Spotify sheets are light cards. Every other screen
follows the light tokens: labels and eyebrows are sentence-case Figtree (the dark rooms keep mono uppercase through
`DarkTypography` / `DarkUi`), corners are softer, small text passes 4.5:1, the games' blind card and every print stay
dark, Run's setup, reveal and Past runs are light while its live screen stays black. Library, Play, You and search
hide their top bar and the tab bar while you scroll down and bring them back on a short scroll up, the top or the
end (`lib/scroll-chrome.ts`, `hooks/use-scroll-chrome.ts`, on the UI thread). Fixed on the way: `ThemedText` gave
a style that named a Figtree weight file the type's 400; the Spotify and Last.fm icons were white on white; the feed
panel was black text on near-black. Plan `docs/superpowers/plans/2026-10-28-minimal-ui-phases-2-3.md`.

## [2026-10-27] Run mode: tap to like that works, and the stride follows a walk-to-run switch
Pocket taps did nothing on a phone, for three reasons. Taps were measured by the size of the acceleration, and a tap
pushes an upright phone sideways, across gravity, where the size barely changes, so `spikes` now measures impulses as
vectors. Standing still, the step finder read the tap itself as a step and vetoed it, so only steps in a stride (6
within 5 s) veto now. And people tap three times: a quick burst of 2 or 3 taps is now one like (4 or more is not).
Tap to like is on by default (profiles that never chose get it on, via `withKnockDefault`), the live screen says
"Tap your pocket 2 or 3 times to like a song", and the tester is a practice screen with a taps-felt count and an
on/off switch instead of a three-in-a-row gate. The stride used to stay within 6 % of the first 90 seconds, so a walk
that became a run kept walking songs; `restride` re-learns it when 30 s of step rate sit more than 10 % to one side.

## [2026-10-27] Expo SDK 58
The App Store's Expo Go moved to SDK 58 and only opens SDK 58 projects, so the Prototype 7 link stopped opening on
iPhones ("Project is incompatible with this version of Expo Go"). Upgraded with `npx expo install expo@^58.0.0 --fix`
(React Native 0.88, React 19.3, Reanimated 4.7, Gesture Handler 3.3, Skia 2.14) and a fresh lockfile, since the old
one pinned expo-router 57's `@expo/ui`. React Native's strict types made refs `ViewInstance` / `ScrollViewInstance`
and styles read-only (`ThemedText` no longer writes into the flattened style). Expo Router's tab bar no longer gets
`navigation`, so `BlindspotTabBar` presses through `emitter` and `navigateToTab`. Native versions changed, so the
app is now 1.0.5.

## Format

```
## [YYYY-MM-DD] Short title
What changed and why.
```

## Entries

<!-- Add entries below this line -->

## [2026-10-22] Run mode (Prototype 7)
A Run card on Play. Pick how hard (Easy, Steady or Push, explained as how much you could still talk, or type a pace)
and which songs (Blind, Mix or Liked), put the phone away and run or walk. Songs are picked to your stride: a song
fits when its tempo, at half, normal or double time, is within 4% of your step rate, read from the accelerometer.
Every minute the app compares your GPS pace with your goal and plays calmer songs when you're too fast and
higher-energy songs when you're too slow, since tempo moves your step rate and energy moves your step length. The
screen stays on but black, because Expo Go stops GPS when the phone locks; touches only count after a half-second hold.
Knocking twice on your pocket likes a song once the knock tester has caught three in a row, and the lock screen's jump
buttons skip and go back. Afterward, the talk test ("Could you talk the whole time?") sets the next Easy pace, and the
reveal shows the pace line with a bar per song, the hardest-hitting song, every song marked "you liked" or "legs
liked" (your pace picked up), and your route with pins. Runs stay on the phone. New native modules (expo-sensors,
expo-location, expo-keep-awake), so the app is now 1.0.4.

## [2026-10-16] The Dark Map
A new map of every measured song, placed by how it sounds: songs you've heard glow (brighter the longer you
listened), saves are red, and everything still dark is your blind spot. Home's bottom row shows how much you've lit
(`MAP · 47%`), and You → Discoveries shows a still of it. Tap a dark spot to see what's there in plain words
("instrumental · electric, 374 songs around here, you've heard 0") and swipe blind there: Home plays the nearest
unheard songs from any genre until you leave, and goes back to the genre by itself when a spot runs dry. New lights
bloom in each time you open it, and a list of regions reads it out for VoiceOver. The sound index now also measures
songs that are only in an artist's Mixed list, so 8,296 of 10,889 catalog songs have sound data (was 5,559).

## [2026-10-14] Older songs look older; the reveal says when a song came out
Every bundled catalog song now carries its iTunes release date (`npm run add-release-dates`), and live iTunes
results keep theirs. Blind, an older song's card comes in warmer and its colors faded, so you can guess the era
before the swipe: navy for this year's songs, charcoal around 2000, espresso at 50 years and older. The fade moves
toward grey, which keeps each color's hue, so the print still shows the song's key and nothing turns violet. The
badge, the piece, posters and the Edition keep the true print. After a reveal, a third line under the artist
reads "Released Mar 23, 1978 · Kaya", with Single or EP for those.

## [2026-10-09] The Edition looks like the motion reel now
With `claude-motion-reel.html` on hand, the Edition was rebuilt in its style: the reel's HUD in the corners (scene,
frame counter, timecode), orange and cream wipes at every cut, film grain, a vignette and an orange progress line;
an intro where orange slams open and BLINDSPOT. rises letter by letter over "five found blind"; and one scene per
find in each of the reel's families. A voxel field rises with the song's energy and ripples at its tempo under a
glass orb holding its cover. The artist's name scrolls as an outlined type wall. The data scene counts up its BPM
and shows its energy and eight measures. Particles stream and gather into rings turning at its tempo. An app card
flips its switches and taps Save. The outro merges black blobs on orange and lands on BLINDSPOT●. The reel's beat
counter was fixed at 120 BPM; here the beat squares tick at each song's measured tempo and there's no bar count.
Also fixed: the Edition opened as a plain screen with a header bar, because its full-screen setting was never saved.

## [2026-10-09] Prototype 6: the feed's loading says what's happening
Loading new songs used to fail quietly (one line of red text) or show a bare spinner, and an empty genre quietly
switched to another. Now the card's place holds a panel with explicit states (`lib/feed-load.ts`,
`components/home/feed-status.tsx`): waiting ("FINDING SONGS · AMBIENT", a turning ring, Cancel), slow after 6 seconds
("Taking longer than usual"), failed ("Couldn't load songs. Check your connection" with Try again and Another genre,
and after repeated failures "Still not working after 2 tries"), nothing left ("No songs left in X"), and stopped.
Cancel abandons the load and puts you back on the song and genre you came from. A refill that fails behind a playing
card says "Couldn't load more songs · tap to try again" above it. Tune and Liked stay reachable under the panel.
Tune → Test network (Off / Slow / Offline, not saved) makes loading slow or fail on purpose so the states can be
shown and tested; songs already playing aren't affected.

## [2026-10-09] You: Piece, Discoveries, Insights
The You tab was one long scroll of about ten cards competing for attention. Now a switch at the top splits it
into three views: Piece (your piece from Home, your Editions, the Called It story) opens first, Discoveries
holds what you found (the count, the Tasteform, Decoded, Rewind, the Called It log, the iceberg), and Insights
holds the numbers (listener type, tiles, how you listen, range, the receipt, the Spotify file cards). Loading
shows placeholder blocks the size of what's coming instead of a lone spinner, and a solid strip sits behind the
status bar so scrolled cards no longer run under the clock.

## [2026-10-09] The Edition: your last five finds as a reel
Every 5 reveals now make an Edition: a ~32-second full-screen reel. A blueprint grid draws in behind BLINDSPOT,
then each find gets its own scene with its preview playing (its particles gathering into its rings, a terrain that
rises with its energy and breathes at its tempo, its rings turning on a circle-of-fifths dial, or its cover held
in a glass orb), titled in mono with the scene number and the reel's frame counter, and it ends on the five
prints in a row. Home says when one is ready; tap to play, tap to pause, swipe down to leave. Share gives a still
picture, never video with the song audio. Past editions replay from the art screen.

## [2026-10-09] Particles with a reason; Sort by sound
The particles on the blind card were decoration. Now they do three things: listening develops them (a loose cloud
that gathers into the song's rings as it plays), your drag moves them (right gathers, left scatters, down drops),
and songs far from what you've saved make them restless with a label: CLOSE TO HOME, NEW GROUND or DEEP IN YOUR
BLIND SPOT (`lib/taste-distance.ts`, calibrated on 60 simulated listeners). Your piece records how closely you
listened: a long listen draws a crisp print, a quick skip a small dot.
Tune → Sound adds five switches (Pace, Energy, Texture, Mood, Groove), each Low / Any / High, so the feed only
serves songs that sound that way, from the bundled catalog and sound index. When a genre runs short it loosens
one switch at a time and says so. The choices stay on through genre jumps and app restarts.

## [2026-10-08] New Home: the sound you hear, drawn; reveal in place; prints instead of covers
Three design reviews of the Oct 8 screen recording agreed: only one gesture was ever taught, the reveal flipped into
a different card where the listener count was the hero, and the art under the card was album covers with no link
to the music. Home now:
- The blind card draws the song's sound as moving particles (Skia): rings sit where its key falls on a
  circle-of-fifths dial (a triad for major or minor), warm colors for major and blue for minor, density from
  energy, breathing at the tempo, driven by the real playback clock. Mono labels show the print slot, the clock
  and `148 BPM · C♯ MAJOR` when measured. Tap pauses (hold-to-play is gone); double-tap still saves.
- Three buttons under the card spell out the swipes: Skip, New genre, More like this. Drag labels say what
  letting go will do.
- Right swipe reveals in place: the particles settle into the song's print, the cover sharpens in the same frame,
  the name and listeners come in, and the print flies into your piece. The next 3 songs are the closest in sound
  from the bundled catalog (More like this). Save, Details and Next replace the buttons; Details holds the links,
  Call it, comments and "The sound" in plain words.
- Down stamps the new genre's name and forks the line in your piece. Skips stay blind and leave a grey ring.
- The piece under the card is generated prints on one line, not covers. The art screen shows the song behind
  any print you tap, and the share picture is drawn by Skia.
Sound data is free and no audio leaves the phone: `npm run build-sound-index` matches each catalog song on Deezer
for its ISRC, then reads ReccoBeats' catalog values (BPM, key, mode and 8 more) into `assets/sound-index.json`;
other songs get the same lookup live, cached. The Tasteform, Taste Decoded and the Blind Spot Test use the same
source, so previews are no longer uploaded to ReccoBeats (Apple's terms: previews are "streamed only").
Also fixed: the art store's hook went stale under the React Compiler (the old "Your collage starts with your first
swipe" that never went away). Spec `docs/superpowers/specs/2026-10-08-new-home-design.md`.

## [2026-10-08] Finds News: "While you were gone"
When something happened to your saved artists since you last looked, a slim strip sits at the top of Home:
"While you were gone · 3". It opens a sheet with one sentence per item: an artist passed a listener milestone
(10K, 25K, 50K, 100K, 250K, 500K, 1M) or grew by a quarter, or put out a new release after you saved them. Called
artists come first, tapping an item plays that saved song, and closing the sheet marks it seen. Release checks use
iTunes, through the same pacing as the pool, at most 8 artists per app open, after Home has its first cards. The
Sunday reminder now says the top news item first. Spec `docs/superpowers/specs/2026-10-08-called-shots-finds-news-design.md`.

## [2026-10-08] Called Shots: Call it on the reveal
"Called it" used to mean an artist doubled, which takes months, and every save counted the same. Now the reveal
card has a Call it button: a dated prediction, 3 a week, take it back the same day. A call hits when the artist
passes a listener milestone above where you called it, or grows by a quarter (`lib/milestones.ts`,
`lib/called-shots.ts`). The Liked list shows "Called Oct 2 at 4.8K → 50K" on called songs and shares a hit as a
text receipt.

## [2026-10-08] Crossfade while dragging
Dragging a card left fades the next song in under the one you're leaving, equal-power so the middle doesn't dip.
Let go without skipping and it eases back; skip and the next song keeps playing from where the fade got to, with
no restart. A second player in `PlaybackProvider` peeks at the next card (`lib/playback-crossfade.ts`,
`lib/crossfade.ts`). Right and down drags don't touch the audio.

## [2026-10-08] Explore from a liked track; three feed bugs
The Liked list has More from this artist and More like this sound under the player, which close the list and steer
Home the same way Tune does (`lib/steer-request.ts`). Fixed a late Similar lookup overriding Undo, the fallback
retrying an empty genre once every genre was heard, and growth math with no starting count (see `bugs.md`).

## [2026-10-03] Called It: an Instagram story of the find that blew up most
The top of the You tab is now a story card sized for Instagram (shared at 1080×1920). It shows the find whose
artist has grown most since you saved it blind: the cover, "I found them before I knew who it was", a line from
their Last.fm listeners on the day you saved it to now (only the two real ends are labeled), and the growth in
big red. Share to Instagram opens the share sheet, and Next find steps through every find that has grown. Picked
from mockups of five story ideas; logic in `calledStories` (`lib/you-stats.ts`).

## [2026-10-03] You page: your listening, worked out; truly blind feed; Spotify file import
The You tab is now a scroll of cards, each one big number and one plain sentence, built from what people most
want to know about their listening (Wrapped, stats.fm, Obscurify, Icebergify, Instafest, and the CHI 2026
"Spotify Warped" survey). It opens with a listener type (The Digger, The Prophet, The Night Owl...) and the
reason for it. Then come three tiles (1 in N songs saved, median listeners when found, artists called) and your
**iceberg** of blind finds, from Famous down to Buried. How you listen covers how many seconds you take to
decide, a 24-hour clock of when you find music, and streaks. Then your range, called it, and a **receipt** of
your latest finds. With a Spotify file imported, **Your Spotify** shows your listening age (median release year),
popularity, the share of blind finds that are new to you, decades, your biggest year and day, and a **festival
lineup**. The iceberg, receipt and lineup share as pictures. Logic in `lib/you-stats.ts`.

Anyone can now import their Spotify songs from exportify.app, a CSV or a ZIP of every playlist, from Rewind or
You (`lib/spotify-file.ts`; no 5-user cap). Home's feed then skips every artist in that file, so each blind card
is someone new (`lib/known-artists.ts`). Only file songs feed stats and the filter. Songs from the login stay
display-only, because Spotify's Developer Policy forbids deriving metrics or functionality from API data.

## [2026-10-03] Rewind: dates on every label, and the scrub only stops on days with songs
Each DAY / MONTH / YEAR zone on the strip now shows the date that step lands on and its year, in three short
lines (six characters at most, so it fits a 360pt phone). The zones are now the same width so they look even,
and a zone with nowhere to go shows "—". The line above the strip always names the real date ("Back a day →
Fri, Oct 2", never "Yesterday"), with "No songs on Oct 3, so the closest day" underneath when it lands off. When
the title says Today or Yesterday, the small line above it shows the date. The scrub now steps only through
days with songs; a month or year scrub steps through the same date each month or year, like a jump. It stops at
the first and latest songs and turns around the moment you reverse, and the readout shows the real day plus
"N days before X" when it's off.

## [2026-10-03] Rewind: slide up to scrub, and Spotify playlist songs
Drag into DAY, MONTH or YEAR, then slide up a little: the step locks, and sliding sideways walks every
calendar day (about 14pt each), month (24pt) or year (40pt), songs or not. Above the strip, a big red readout
shows the part you're changing ("24", "Apr", "2023") with the full date and how many songs that day has, and
the day's songs change live as you go. Days with songs tick harder. Letting go lands there, or on the closest
day with songs, with the "N days before" tag. In a zone, a line under the preview says "Or slide up to scroll
through every day". The Spotify import now also brings in songs you added to your own or collaborative
playlists (`GET /playlists/{id}/items`, the post-February-2026 name; a friend's adds to a shared playlist
don't count). Each song comes in once (same Spotify id, or same name and artist), dated the first time you
liked or added it. Each cover says "Liked" or "Added to <playlist>". Re-syncing asks Spotify for the two
playlist permissions.

## [2026-10-03] Rewind: same day last month, same day last year
Rewind now always shows one day. A month jump keeps the date (Oct 5 back to Sep 5), and so does a year jump
(Oct 5, 2025). With no songs on that exact day it lands on the closest day that has some and says so under the
date ("3 days before Sep 5"). The day you aimed at sticks, so the next jump still aims at the 5th, not wherever
it landed. A jump only ever moves the way you dragged; when nothing is that way the strip shakes. A short drag
still steps to the previous day with songs and aims from there. Logic in `jump`/`offsetLabel`, `lib/rewind.ts`.

## [2026-10-03] Rewind: your Spotify liked songs, behind a switch
A Spotify switch in Rewind's header logs in once and brings in every song you've liked on Spotify, with the day
you liked it. Those songs show under "Liked on Spotify" in each day, month or year, and the year zone finally has
years in it. They stay apart from blind finds: separate storage (`lib/spotify-api.ts`, chunked because Android
can't read back one value over about 2 MB). They never count as finds, never join the Tasteform and never leave the
phone. Tapping one opens it in Spotify, since Spotify has no previews now and its rules want content to link back.
The footer has Sync again and Remove. Login is PKCE with no secret (`lib/spotify.ts`, `expo-crypto` added). Spotify
always redirects to one fixed page, `blindspot.expo.app/spotify-callback`, which hands the code back to this app's
link only (Expo Go links change with every update, and Spotify wants exact redirect URIs). Development mode limits
it to 5 Spotify accounts, added by hand in the Spotify dashboard, and the app owner needs Premium.

## [2026-10-03] Rewind: drag back through your finds by day, month or year
A Rewind row under the Tasteform opens `app/rewind.tsx`, which starts on the day of your latest find. Drag
left anywhere to go back and right to go ahead. How far you drag sets the step: a short drag moves a day,
further a month, furthest a year. Each step lands on the nearest day, month or year you actually saved
something, so a swipe never lands on an empty day. The DAY · MONTH · YEAR strip at the bottom shows which zone
your finger is in. Each zone is also a button, and a zone with nowhere to go is dimmed. Crossing into a zone
ticks the phone. A jump spins the cassette's reels and ticks like tape winding, with a bigger thump for bigger
jumps. Past your first or latest find, the strip shakes. Each day, month or year shows "3 songs found, out of
41 you heard" and its covers; tap one to hear it. It uses only the app's own saves and swipe log, no Spotify
or Apple login (see the features.md entry for why). Logic and tests are in `lib/rewind.ts`.

## [2026-10-02] Taste Decoded: one honest sentence about your taste
The You tab now says what your saves have in common, judged against what each genre normally sounds like:
"You don't hate Country. You hate happy Country." Tap it for the Decoded page: up to 3 findings, each with
your songs on a bar against the genre's normal, a vote ("Sounds like me" / "Nope", counted anonymously for
the paper) and a share card. A finding you haven't opened lights the YOU dot and becomes the Sunday
reminder. Baselines: 30 measured songs per genre (`npm run measure-genre-sound`). The Blind Spot Test now
keeps its songs. Spec: `docs/superpowers/specs/2026-10-02-taste-decoded-design.md`.

## [2026-10-01] Reveal card: play controls and a big Next up top
After a right swipe the song kept playing with no way to stop it, because hold-to-pause only lives
on the blind card. The reveal now opens with play/pause, play-from-the-start and a big Next button,
then a small cover with the title, artist and genre, then the listener count. Links, the big cover,
the human check, save and comments sit below "Swipe up to reveal more", which also scrolls there
when tapped. DJ Picks uses the same card. The collage flight now takes off from the small cover.

## [2026-10-01] High-energy songs sprout buds on the Tasteform
In Shape view, a saved song measured at 0.55 energy or more throws off 1–3 small buds in its cover's
color, just outside its cell and facing the way the shape grows (more energy, more buds). Near ones
melt into the body as nubs, far ones float as droplets. They never move the cells, and the island
views don't sprout. This was the last piece of the image prototype still missing.

## [2026-10-01] Notes, Recently deleted and restore for saved songs
Saved songs now go through every state and keep it across relaunches: save (double-tap), add or edit
your own note (the player bar's "Add a note", shown in handwriting under the cover), delete (Liked's
Select all / Delete, or the heart) into a new Recently deleted page instead of vanishing, and restore
from there to the song's old spot, note and all. Empty Liked points to Recently deleted when it has
songs. Pure logic in `lib/saved-songs.ts` (tested); Liked and Recently deleted share one write queue.

## [2026-09-30] Saves fly into your shape
A save on Home now drops into the You tab: the heart pops, then the song falls into the YOU icon as a
glowing cell (blurred colors while it's still blind, the real cover once revealed). The icon bumps and
keeps a red dot until you open You, where the new song flies up from the tab bar into its place in the
Tasteform with a gold halo that fades (`components/save-flight.tsx`).

## [2026-09-30] Tasteform breathes with your music
Each saved song's preview is measured once by ReccoBeats for energy and mood. The shape now breathes
at the average energy of your saves (calm = slow, intense = quick), each cover pulses at its own song's
energy, and one line under the shape says which. Tempo is stored but not used: it's unreliable on 30s clips.

## [2026-09-30] Tasteform on the You tab; softer swipe tint
The You tab now opens on the Tasteform: every saved song is a cell of one living shape, colored by
its cover, grown by genre family and popularity (spec: `docs/superpowers/specs/2026-09-30-tasteform-design.md`).
It re-forms into Genre, Listeners, Color and When islands so every cover shows, and any cover plays
on tap. On Home, the skip/like tint is now a wash from each edge that fades out before the middle,
instead of two half-card blocks with a hard line between them (user feedback).
