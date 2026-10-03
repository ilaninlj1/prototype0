# Changelog

Notable changes to this project, logged as dated entries. Unlike `bugs.md` and `features.md`,
this file is a record of what shipped, not a queue of open items — it is not scanned for
staleness.

Add new entries at the top, newest first.

## Format

```
## [YYYY-MM-DD] Short title
What changed and why.
```

## Entries

<!-- Add entries below this line -->

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
