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
