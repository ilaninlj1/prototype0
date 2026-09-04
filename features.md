# Features

Feature ideas and requests, logged as dated entries. At the start of every session, entries
older than 30 days are flagged as a reminder (see the checklist in `CLAUDE.md`).

Add new entries at the top, newest first.

## Format

```
## [YYYY-MM-DD] Short title
Description of the feature, motivation, and any relevant context.
```

## Entries

<!-- Add entries below this line -->

## [2026-09-02] Replay the current clip before rating
Each 30s preview plays once and then you rate it. If you get distracted, or the audio
starts before headphones are on, there's no way to hear it again without restarting the
whole session. A replay button on the playing screen would fix it.

## [2026-09-02] Adjustable session length
TRACKS_PER_SESSION is hardcoded to 10. Some people will want a quick 5-track round,
others will want to keep going past 10. Make it a choice on the setup screen.

## [2026-09-02] Share your results
The summary screen lists your mismatches, which is the interesting part and the reason
someone would tell a friend about the app. Right now there's no way to share it.

## [2026-09-02] Clearer resume behavior
On second launch the app skips setup and resumes from saved genre picks. Convenient, but
invisible — a returning user may think the genre screen is broken. Consider a "Resume or
start over?" prompt instead of jumping straight in.


## [2026-09-04] Undo the last swipe
A mis-swipe is currently permanent — the track is logged as seen and never
resurfaces. In a thumb-driven interface that's going to happen constantly.
An undo button should pop the last swipe entry and put the track back on top.

## [2026-09-04] Saved list of liked tracks
Right-swipes steer what plays next but aren't kept anywhere, so there's no way
to go back to something you liked. Saving them would give the app a reason to
return to, and would give the Profile tab real data again now that the quiz no
longer feeds it.

## [2026-09-04] Crossfade between tracks while dragging
While a card is being dragged, the current track and the next one should mix,
resolving fully when the swipe commits. Would need two audio players with
volume driven by drag distance, instead of the single player swapping sources.

## [2026-09-04] Move the artist/sound choice into the swipe itself
The post-like overlay asks a second question the swipe already answered, and the
buttons are easy to miss before they auto-dismiss. Better: let the direction carry
the intent — one direction for "more from this artist," another for "more like this
sound" — so there's no deferred choice and no timer. Removes action-overlay.tsx
entirely. Needs a visual hint that appears while dragging so the user can see where
each direction leads.
