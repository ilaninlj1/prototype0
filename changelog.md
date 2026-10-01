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
