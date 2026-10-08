# Called Shots + Finds News (v1) — design

2026-10-08. Two features from `features.md` (2026-10-02 entries) that share one rule set: listener milestones.
Goal: give people a reason to come back ("people coming back" was the goal picked on 2026-10-02).

## Shared: milestones (`lib/milestones.ts`, pure, tested)

- Milestones: 10K, 25K, 50K, 100K, 250K, 500K, 1M listeners (Last.fm).
- `crossedMilestone(before, now)` → the highest milestone with `before < m <= now`, or null.
- `grewALot(before, now)` → true when `now >= before * 1.25` and `now - before >= 1_000` (the floor stops a
  40 → 50 listener wobble from counting).
- `describeMilestone(...)` → one plain sentence, e.g. "Mabe Fratti passed 50K listeners. You found them at 4.8K."
- No baseline (0 or missing) never counts as growth (matches `describeGrowth` since 2026-10-08).

## Called Shots

Today's "Called it" means the artist doubled, and every save counts the same. A call is a dated prediction.

- **Where:** the reveal card gets one cream button, **"Call it"**, next to the existing controls. Tapping it
  saves the song (if it isn't saved) and records a call. Tapping again the same day takes the call back.
- **Limit:** 3 calls per rolling 7 days. At the limit the button reads "3 calls this week" and is disabled.
- **Stored** (`lib/discovery-storage.ts`, key `blindspotDiscovery:calls`, same best-effort convention):
  `{ trackId, trackName, artistName, artistId, listenersAtCall, calledAt }`.
- **Hit:** a call hits once the artist's listeners cross a milestone above `listenersAtCall` or `grewALot`.
  Uses the existing `useListenersNow` cache (12h), so no new network pattern. Chart and KEXP hits are left out
  of v1 (the 2026-10-02 odds check says they're rare for small finds).
- **Shown:** in the Liked list, a called row shows "Called Oct 2 at 4.8K" and, once it hits, "→ 50K".
  The summary card adds one line: "Your calls: 2 hit, 1 waiting".
- **Share:** a hit row's share button sends the receipt as text through the Share sheet:
  "Called it blind on Oct 2 at 4,800 listeners. Now 50K. — Blindspot".

## Finds News

"While you were gone": what happened to your saved artists since you last looked. Local only in v1.

- **Sources (v1):**
  1. **Milestones** for saved artists: keep the listener count you last saw per artist
     (`blindspotDiscovery:newsSeen`, `{ [artistName]: { listeners, seenAt } }`); news when a milestone was
     crossed or `grewALot` since then. Called artists come first.
  2. **New releases:** iTunes `lookup?id=<artistId>&entity=album&sort=recent&limit=5`, a release dated after
     the song was saved and after the last check. Paced through the same serial iTunes pacing `lib/pool.ts`
     uses, at most 8 artists per app open, oldest-checked first, results cached in storage
     (`blindspotDiscovery:releaseChecks`). Never blocks the feed; runs after Home has its first cards.
- **Left out of v1** (logged, not built): first finder and twin saves (need saves uploaded), KEXP and chart
  entries (rare), a shared server-side release lookup.
- **Where:** a slim strip at the top of Home, only when there's news: "While you were gone · 3". Tapping it
  opens a sheet listing each item as one sentence with the song's cover; tapping an item plays that saved song
  in the mini player. Closing the sheet marks the items seen (updates `newsSeen`), so the strip goes away.
- **Sunday reminder:** `nudgeContent` takes the top unseen news item first, so the weekly reminder says the
  real news ("Mabe Fratti passed 50K listeners"), then the Taste Decoded finding, then today's fallback.

## Not doing

Push notifications beyond the existing weekly reminder; any server code; picture share cards (those live on
the unmerged `you-page` branch and can wrap this later).

## Testing

Pure rules in `lib/milestones.ts`, `lib/called-shots.ts` (limit, take-back, hit), `lib/finds-news.ts`
(building items from liked tracks + seen state + release checks, ordering) with Node's test runner, plus
`nudgeContent`'s new priority in `lib/nudge-config.test.ts`.
