# Rebuild the Profile Tab as a Listening-Data Screen

**Goal:** The Profile tab (`app/(tabs)/explore.tsx`) is still wired to the retired rating quiz (`lib/taste-test.ts`'s `GenrePicks`/`isMismatch`/`loadHistory`) and shows nothing relevant to the swipe-based discovery flow. Rebuild it as a pure listening-data screen driven entirely by `swipeHistory` (`lib/discovery-storage.ts`): genres by listen time vs. by visit count, average listen time, artists that beat that average, tracks played to the end but skipped anyway, discovered-genre count, and a genre path — both for the current session and overall. No external popularity data; everything is derived from data already collected.

**Scope:** `lib/discovery.ts` (`SwipeEntry` schema + new derive/rank functions), `lib/discovery.test.ts` (new coverage), `app/(tabs)/index.tsx` (`logSwipe` populates the two new fields), `app/(tabs)/explore.tsx` (full rebuild). No changes to `lib/discovery-storage.ts` — it persists `SwipeEntry[]` as an opaque JSON blob, so new optional fields need no storage-layer change.

## `SwipeEntry` gains `trackName` and `artistName`

```ts
export type SwipeEntry = {
  trackId: number;
  trackName?: string;
  artistId: number;
  artistName?: string;
  genre: string;
  action: SwipeAction;
  timestamp: number;
  listenMs?: number;
};
```

Both optional, same precedent as `listenMs`: populated from `track.trackName`/`track.artistName` (already available on `DiscoveryTrack` at the point `logSwipe` is called) for every new entry going forward. Entries persisted before this change lack them — no migration, no backfill. This is required because neither name is derivable any other way once a track has scrolled out of the fetch queue: `SwipeEntry` previously carried only `artistId`/`trackId`, and the only place full names persist longer-term is the separate `likedTracks` list, which covers a minority of swipes.

```ts
// app/(tabs)/index.tsx, logSwipe
const entry: SwipeEntry = {
  trackId: track.id,
  trackName: track.trackName,
  artistId: track.artistId,
  artistName: track.artistName,
  genre: track.primaryGenreName,
  action,
  timestamp: Date.now(),
  listenMs: Math.round(status.currentTime * 1000),
};
```

## Session derivation

No new stored field — sessions are recomputed from `swipeHistory` timestamps every time they're needed, so this works retroactively on history already on disk.

```ts
export const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes

export type Session = {
  entries: SwipeEntry[]; // chronological
  startedAt: number;
  endedAt: number;
};

export function deriveSessions(history: SwipeEntry[]): Session[]
```

Sorts `history` by `timestamp` ascending, then splits into a new session wherever the gap to the previous entry exceeds `SESSION_GAP_MS`. Returns sessions oldest-first; the last element is "the current session" — there is no live/in-progress tracking, "current" just means "most recent by this derivation," consistent with everything else here being computed fresh from persisted timestamps.

## Genre path and visits

```ts
export type GenreVisit = {
  genre: string;
  trackCount: number;
  listenMs: number; // sum over the run; entries missing listenMs contribute 0
  startedAt: number;
};

export function deriveGenrePath(entries: SwipeEntry[]): GenreVisit[]
```

Takes one session's chronological `entries` and collapses consecutive same-genre entries into a single `GenreVisit` run. Because it operates per-session, a session boundary always ends a run even when the genre doesn't change across the gap — resuming the same genre after 30+ minutes away is a new visit, not a continuation. Two uses:

- **Session path display:** `deriveGenrePath(session.entries).map(v => v.genre)` joined with " → ".
- **Visit-count ranking:** `sessions.flatMap(s => deriveGenrePath(s.entries))` gives every visit across all history; counting runs per genre is the visit count.

## Ranking and averages

```ts
export function rankGenresByListenTime(history: SwipeEntry[]): { genre: string; listenMs: number }[]
// Sums listenMs per genre (missing treated as 0), sorted descending.

export function rankGenresByVisits(sessions: Session[]): { genre: string; visits: number }[]
// sessions.flatMap(s => deriveGenrePath(s.entries)), grouped by genre, counting
// runs (not tracks), sorted descending.

export function averageListenMs(history: SwipeEntry[]): number
// Average over entries where listenMs !== undefined only — entries without it
// are excluded from both sum and denominator, not treated as 0 (matching
// deriveRatedGenres's existing "no listenMs means don't count it" precedent).
// Returns 0 if no entry qualifies.
```

## Played to the end, skipped anyway

```ts
export const PLAYED_TO_END_THRESHOLD_MS = 25000;

export function derivePlayedToEndButSkipped(history: SwipeEntry[]): SwipeEntry[]
// Entries where action === 'skip' && (listenMs ?? 0) >= PLAYED_TO_END_THRESHOLD_MS,
// newest first.
```

Track duration isn't stored anywhere (iTunes previews are nominally ~30s but this is never verified per-track), so "reached the end" is approximated by elapsed listen time alone. 25000ms is a deliberately loose threshold given that approximation. Named constant, easy to retune. Display uses each entry's own `trackName`/`artistName` directly (falling back to "Unknown track" / the genre if an old entry predates those fields) — no cross-entry lookup needed here, unlike artist ranking below.

## Artists that beat your average

```ts
export type ArtistStat = {
  artistId: number;
  artistName: string;
  avgListenMs: number;
  trackCount: number;
};

export function deriveTopArtists(history: SwipeEntry[], minTracks = 2): ArtistStat[]
```

Groups entries by `artistId`. Since `artistName` is only present on entries logged after this change, each artist's display name is resolved as the most recent non-empty `artistName` seen for that `artistId` across history; an `artistId` with no named entry anywhere is excluded (nothing sensible to display). Within qualifying groups (`trackCount >= minTracks`, default 2, to avoid a single long listen putting a one-track artist at the top), keeps artists whose `avgListenMs` (over entries with `listenMs` present, same exclusion rule as `averageListenMs`) exceeds `averageListenMs(history)`. Sorted descending by `avgListenMs`.

## Screen layout (`app/(tabs)/explore.tsx`)

Full rebuild. Drops every `lib/taste-test.ts` import — no `GenrePicks`, no `isMismatch`, no "Redo setup" (the swipe flow has no setup step to redo). Loads `loadSwipeHistory()` + `loadDiscoveredGenres()` on focus via the same `useFocusEffect` pattern already in place. Empty state (`history.length === 0`) stays a single message pointing at the Home tab.

Built from existing primitives only (`ThemedView`/`ThemedText`, `Colors`/`Spacing`/`Radius`) — no new UI components needed:

1. **Top stat tiles** (today's 2-up tile row, extended): `tracks logged`, `avg listen time`, `genres discovered`.
2. **"Where you go vs. where you stay"** — two-column compare row (today's `compareRow`/`compareCol` styling): left = top 5 genres by listen time (`Xm Ys`), right = top 5 by visit count (`N visits`).
3. **"Artists beating your average"** — ranked list: `artistName — avg listen time (n tracks)`. Empty-state line if none qualify.
4. **"Played to the end, skipped anyway"** — list of `trackName — artistName`, newest first, scrollable if long.
5. **"Genre path"** — current session's chain as one wrapped line (`Pop → House → Jazz`), then a scrollable "All sessions" list below it, newest first, each row showing a relative timestamp, track count, and its own collapsed chain.

## Testing (`lib/discovery.test.ts`)

New cases, following the file's existing pure-function-per-`describe` style:

- `deriveSessions`: single session (no gaps), a gap just under/at/over `SESSION_GAP_MS` (boundary is exclusive — exactly 30 minutes does not split), multiple sessions, empty history, unsorted input.
- `deriveGenrePath`: consecutive same-genre entries collapse to one visit; a genre change starts a new visit; `listenMs`/`trackCount` sum correctly within a run; empty input.
- `rankGenresByListenTime` / `rankGenresByVisits`: correct grouping and descending sort; a genre resumed after a session gap counts as two visits, not one.
- `averageListenMs`: entries without `listenMs` excluded from both sum and denominator; empty/all-missing input returns 0.
- `derivePlayedToEndButSkipped`: boundary at exactly the threshold; a `like` at high `listenMs` is excluded (action must be `skip`).
- `deriveTopArtists`: `minTracks` filtering; an artist whose only named entry is not its most recent still resolves a name; an artist with no named entry anywhere is excluded; comparison against `averageListenMs`.

## Files touched

| File | Change |
|---|---|
| `lib/discovery.ts` | `SwipeEntry.trackName`/`artistName`; `SESSION_GAP_MS`, `Session`, `deriveSessions`; `GenreVisit`, `deriveGenrePath`; `rankGenresByListenTime`, `rankGenresByVisits`, `averageListenMs`; `PLAYED_TO_END_THRESHOLD_MS`, `derivePlayedToEndButSkipped`; `ArtistStat`, `deriveTopArtists` |
| `lib/discovery.test.ts` | New test cases per above |
| `app/(tabs)/index.tsx` | `logSwipe` populates `trackName`/`artistName` |
| `app/(tabs)/explore.tsx` | Full rebuild per the layout above |

## Out of scope

- Any migration or backfill of `trackName`/`artistName`/`listenMs` on existing persisted entries.
- Live/in-progress session tracking, or any new persisted session field — sessions stay purely derived from timestamps on every read.
- External popularity/chart data of any kind.
- Tuning `SESSION_GAP_MS`, `PLAYED_TO_END_THRESHOLD_MS`, or the `minTracks` default beyond picking reasonable starting values — all are named constants.
- Changes to Home-tab swipe/discovery behavior beyond `logSwipe` capturing the two additional fields.
