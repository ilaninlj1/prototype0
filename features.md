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

## [2026-09-08] Taste Space is blocked on the candidate source, not on Last.fm
Live probe from the app runtime (Expo Go, not node): Last.fm answered every call
cleanly, HTTP 200 across the board — the CORS/reachability concern from the Last.fm
data layer spec is resolved, at least for this runtime.

But a rock/US probe (25 tracks) found 24 of 25 were top-50 hits by major artists.
The iTunes Search pool `refillQueue` fetches from occupies only the Hits corner of
the pad — there are essentially no deep cuts on the X axis to draw from, and Y is
compressed at the high-reach end. Last.fm can score whatever candidates show up;
it has no way to fix a candidate pipeline that never surfaces anything belonging
elsewhere on the pad.

**Possible fix, not a plan:** invert the pipeline — have Last.fm's
`artist.getTopTracks` (or similar) supply deep-cut/niche candidates directly, and
use iTunes Search only to resolve preview URLs/artwork for whatever Last.fm names.
That's the reverse of the current "iTunes finds candidates, Last.fm scores them"
direction. Open question for whenever Taste Space's data layer is actually
designed further — see the status note at the top of
`docs/superpowers/specs/2026-09-07-taste-space-design.md`.

## [2026-09-02] Replay the current clip before rating
Each 30s preview plays once and then you rate it. If you get distracted, or the audio
starts before headphones are on, there's no way to hear it again without restarting the
whole session. A replay button on the playing screen would fix it.

**Status: Done (superseded).** The rating-quiz flow this described no longer exists —
the app is swipe-based now — but the underlying need (replay a clip) is met by
tap-to-pause/resume/replay on the swipe card (commit 7fb5dc7).

## [2026-09-02] Adjustable session length
TRACKS_PER_SESSION is hardcoded to 10. Some people will want a quick 5-track round,
others will want to keep going past 10. Make it a choice on the setup screen.

**Status: Obsolete.** `TRACKS_PER_SESSION` and the setup screen it belonged to no longer
exist — the swipe-discovery feed is continuous, with no fixed session length to make
adjustable.

## [2026-09-02] Share your results
The summary screen lists your mismatches, which is the interesting part and the reason
someone would tell a friend about the app. Right now there's no way to share it.

**Status: Obsolete.** The summary/mismatch screen belonged to the retired rating quiz
and no longer exists. The closest thing today, the Profile tab's listening-data
analytics, isn't a "results" screen in the same sense — nothing to directly revive this
against.

## [2026-09-02] Clearer resume behavior
On second launch the app skips setup and resumes from saved genre picks. Convenient, but
invisible — a returning user may think the genre screen is broken. Consider a "Resume or
start over?" prompt instead of jumping straight in.

**Status: Obsolete.** Genre picks and the setup screen no longer exist — the app starts
directly into the swipe feed, with no setup step to resume past or clarify.


## [2026-09-04] Undo the last swipe
A mis-swipe is currently permanent — the track is logged as seen and never
resurfaces. In a thumb-driven interface that's going to happen constantly.
An undo button should pop the last swipe entry and put the track back on top.

**Status: Done.** Commit 5397ad1, "Add one-level, full-rollback undo for the last swipe."

## [2026-09-04] Saved list of liked tracks
Right-swipes steer what plays next but aren't kept anywhere, so there's no way
to go back to something you liked. Saving them would give the app a reason to
return to, and would give the Profile tab real data again now that the quiz no
longer feeds it.

**Status: Done.** Commit 36315ad, "Add liked tracks list, reachable from the swipe
screen." (The Profile tab was later rebuilt around swipeHistory/session data instead —
see the 2026-09-05 listening-data design — so it ended up not depending on this list.)

## [2026-09-04] Crossfade between tracks while dragging
While a card is being dragged, the current track and the next one should mix,
resolving fully when the swipe commits. Would need two audio players with
volume driven by drag distance, instead of the single player swapping sources.

**Status: Open.**

## [2026-09-04] Move the artist/sound choice into the swipe itself
The post-like overlay asks a second question the swipe already answered, and the
buttons are easy to miss before they auto-dismiss. Better: let the direction carry
the intent — one direction for "more from this artist," another for "more like this
sound" — so there's no deferred choice and no timer. Removes action-overlay.tsx
entirely. Needs a visual hint that appears while dragging so the user can see where
each direction leads.

**Status: Done, different mechanism.** `action-overlay.tsx` was removed and steering is
no longer deferred, per commit b1567f5, "Make steering always-available, replacing the
post-like overlay" — but via a persistent steering row next to the card, not by
repurposing swipe direction as this entry proposed. No drag-time visual hint exists,
since there's no direction-based intent left to hint at.

## [2026-09-04] Save liked tracks to Spotify or Apple Music
Right now the app finds you songs and then loses them. Liking a track should be
able to save it straight to a Spotify playlist or liked songs. Needs OAuth for
Spotify (auth flow, token storage, refresh) and a track-matching step, since we
hold an iTunes track and have to find the same song in their catalog by artist
and title — matching will sometimes fail. Apple Music is the same idea but needs
the $99 developer account, though the catalog IDs may line up directly since the
previews already come from Apple.

**Status: Open.**

## [2026-09-05] Explore from a liked track
The liked list is currently a dead end — you can play, link out, or delete, but
not act on it. Tapping a liked track should offer "more from this artist" and
"more like this sound," setting the strategy and returning to the swipe feed.
Same machinery as the post-like overlay, but reachable when you're browsing what
you saved rather than only in the moment after a swipe. May be a better home for
those two options than the overlay is.

**Status: Open.** The overlay this refers to is gone now (steering is a persistent row,
not a post-like overlay — see "Move the artist/sound choice into the swipe itself"
above), but the underlying idea — act on a liked track from the liked list — is
untouched. `applySteeringStrategy` in `app/(tabs)/index.tsx` is the machinery to reuse.

## [2026-09-05] Base "heard" on listen time, not skip/like
The genre picker's checkmark currently means "swiped left or right on a track
from this genre" (deriveRatedGenres in lib/discovery.ts) — but a two-second
skip counts the same as actually listening, which doesn't match what "heard"
is supposed to mean. Needs a listenMs field on SwipeEntry (accumulated preview
playback time before the swipe commits, not just whether one happened), and
deriveRatedGenres redefined against a listen-time threshold instead of action
type. Touches logSwipe's call sites in app/(tabs)/index.tsx (need to thread
elapsed playback time from the player into each swipe) and the SwipeEntry
schema in lib/discovery.ts — existing persisted entries won't have listenMs,
so the new logic needs a sensible fallback for old data (probably: no
listenMs recorded means don't count it as heard, same as it not existing).

**Status: Done.** Commit ca044e1, "Base 'heard' on listen time instead of swipe
action" — `listenMs` landed on `SwipeEntry` exactly as described, and has since become
the basis for the whole 2026-09-05 listening-data Profile tab (average listen time,
genre-by-listen-time ranking, artists beating your average, etc.), not just the
picker's checkmark.

## [2026-09-05] iTunes Search API constraints — investigated, don't re-explore
Several plausible-sounding ways to get better results out of the iTunes Search API
were tried live and found not to work. Recorded here so they don't get re-investigated:

- **`offset` is silently ignored.** No real pagination exists on `search` — a fixed
  `term` always returns the same page, byte-identical at any offset (checked 0/75/150/400,
  two terms, two limits including the app's actual `limit=200`).
- **`genreId` and the documented `attribute=genreIndex` are also dead**, verified live
  the same way: identical results with/without either, a garbage `genreId` doesn't
  error, a term-less `genreId`-only query returns nothing.
- **There is no server-side genre constraint on this endpoint at all.**
  Client-side `primaryGenreName` filtering (`isGenreRelated`/`GENRE_TERM_OVERRIDES`) is
  the only lever that actually does anything — see
  `docs/superpowers/specs/2026-09-05-generic-genre-title-filter-design.md`.
- **A broad "primaryGenreName must exactly equal the requested genre" filter was
  evaluated and rejected for starvation** — it zeroes reggaeton's pool entirely (iTunes
  never tags anything literally "Reggaeton") and cuts Techno's lifetime pool by 93%
  (153 → 11), since it defeats `GENRE_TERM_OVERRIDES`, which exists specifically for
  genres iTunes doesn't literally tag. Same doc as above.
- **Region/storefront divergence (the `country` param) is a genre+storefront property,
  not a country property.** US vs. MX (reggaeton) and US vs. ZA (amapiano) diverge
  meaningfully (56% and 9.3% artist-set overlap); US vs. CO (reggaeton) and US vs. NG
  (afrobeats) come back ~90-97% identical — dead controls; US vs. KR (K-pop) returns
  zero results for the literal term the app would send; PR isn't a valid storefront at
  all (Apple rejects it, no separate PR storefront exists). Shipped scoped to
  US/MX/ZA — see `docs/superpowers/specs/2026-09-05-region-storefront-design.md`. Any
  future region needs this same live check before being added or assumed to behave like
  a neighboring one.

## [2026-09-05] Background taste weighting
Genre-jump/fallback selection (`pickJumpGenre`) currently has no notion of which genres
you actually enjoy — it picks by "unexplored" and "least-recently-heard," not by
anything like a preference signal. Now that real per-track `listenMs` history exists
(see "Base 'heard' on listen time" above, and the whole listening-data Profile tab it
feeds), that history could bias genre selection toward genres you demonstrably spend
more time in, without asking you to rate anything explicitly. Blocked on nothing
technical — the data already exists — but needs its own design pass: what "weighting"
actually changes (jump selection? fallback order? both?), and how it interacts with
deliberate steering, which is supposed to represent a stronger, more immediate signal
than ambient listening time.

## [2026-09-05] Genre adjacency from path data
The Profile tab's genre path (`deriveGenrePath`/`deriveGenrePathSegments`) already
records the literal sequence of genres each session moves through. That's raw material
for a "genres that tend to follow each other" view (e.g. people who drift from House
usually end up at Techno) that doesn't exist yet — path data is currently only rendered
as a per-session chain, never aggregated across sessions into a transition/adjacency
view. Purely additive on top of existing data; no new persisted fields needed, same
"derive it from what's already on disk" approach the sessions/path features already use.

## [2026-09-05] Search + song page
A search bar that queries the iTunes search endpoint with a user-typed term (rather
than a curated genre term), landing on a song page for a chosen result — showing
whatever metadata is already in the response (title, artist, album, artwork, release
date, genre, length) plus the 30s preview. From that page, the existing steering moves
— "more from this artist" / "more like this sound" — drop you into the feed anchored on
that track.

Shares its mechanism with "Explore from a liked track" above: both are an entry point
that hands off into steering (set strategy from an arbitrary track, jump to the feed).
Build that handoff once — probably by extracting what `applySteeringStrategy` already
does into something callable from outside `app/(tabs)/index.tsx` — and use it from both
this and the liked-track entry, rather than reimplementing it twice.

**Out of scope, explicitly:** any written explanation or description of a song. iTunes's
response is metadata only — no description, no context, nothing to display beyond the
fields listed above. Producing one would mean a per-track LLM call, which means an API
key living in a client-side app. Not part of this entry; a real design question for
whenever/if that's actually wanted.
