# Play Tab: Daily Drop + Two Guessing Modes

**Goal:** Home goes back to being only the blind discovery feed. Everything
game-like moves to a new **Play** tab: the Daily Drop (moved off Home) and
two endless guessing modes. The Daily Drop results turn from a list into
full cards you swipe through.

**Builds on:** `2026-09-29-daily-drop-design.md`. Its picking, data,
Supabase tables, guess, and share rules all stay; only *where* things live
and how the results look change.

## 1. Tabs

`Home` (feed, unchanged) · **`Play`** (new, `app/(tabs)/play.tsx`) · `Profile`.
The Home header loses the "Daily Drop · n/5" pill and the "Today's drop ✓"
chip, and the Home stack no longer shows drop cards. Home reloads swipe
history on focus, so drop swipes logged elsewhere aren't overwritten by a
later feed undo.

## 2. Play tab

A column of three cards:

| Card | Shows | Tap goes to |
|---|---|---|
| **Daily Drop #N** | one of: "Play today's 5" · "Continue · 2/5" · "Make your guess" · "Liked 3/5 · 🎯 ✓ — see your songs" · "No drop today" when there's none or no network | `/drop-play` · `/drop-guess` · `/drop-results` |
| **Spot the Star** | "Find the one with 1M+ listeners" · best streak | `/play-spot` |
| **Head to Head** | "Which has more listeners?" · best streak | `/play-h2h` |

The tab refreshes its state on focus.

## 3. Daily Drop play screen (`app/drop-play.tsx`, full screen)

This is the same blind card stack as Home, with the same swipes and tap zones (down is off). The header has a close ✕ (progress is kept, so you can come back later), the "Daily Drop · n/5" pill, and Undo. It uses the existing `useDailyDrop` hook. Swipes are logged with `source: 'drop'` via `appendSwipeEntry`. After the 5th swipe the screen replaces itself with `/drop-guess`. The guess screen and its behaviour are unchanged.

## 4. Daily Drop results: swipeable cards (`app/drop-results.tsx`)

- **Top:** "Blindspot Daily #N", the headline, and the guess line (unchanged text; "it was #4" still means drop position).
- **Middle:** a horizontal pager of 5 full-size revealed cards, **ordered from fewest to most listeners**, so swiping is a climb toward the famous one. You swipe left and right and can go back.
- **The ranking is always visible.**
  - Each card has a big rank badge: "#1 · fewest listeners", "#2", "#3", "#4", "#5 · most listeners".
  - A 5-step ladder under the pager (5 dots, left = fewest) fills in up to the current card, so you always see where this song sits.
- Each card shows:
  - artwork (big), title, artist
  - listener count (big) plus its `describeListeners` verdict
  - tags when they apply: "The secret famous one", "🎯 Your guess"
  - "♥ You liked it" / "✕ You skipped it"
  - a crowd bar and `crowdLabel`
- The card in view plays its preview automatically, like the feed. Holding a card pauses it.
- **Bottom:** Share (unchanged text) and Done, which closes back to Play.

## 5. Mode: Spot the Star (`app/play-spot.tsx`)

- **A round** is 4 blind numbered tiles. Tap a tile to hear its song, where tapping another tile switches songs. Exactly one tile's artist has ≥ 1,000,000 listeners; the other three have < 1,000,000. You tap a tile, then "Lock in".
- **After the guess** all 4 tiles flip to show artwork, artist, title, and count, with the right one highlighted. Right: streak +1, and "Next" deals a new round. Wrong: game over, showing streak and best, with "Play again".
- **Difficulty:** while streak < 5 the three decoys are all < 250K. From streak 5 on, at least one decoy is in 250K–999,999 when the pool has one.

## 6. Mode: Head to Head (`app/play-h2h.tsx`)

- **A round** is two blind tiles, A and B. Tap to hear each, then tap "A has more" or "B has more".
- **After the guess** both flip to show their counts. Right: the one with more listeners stays, a new challenger replaces the other, and the streak goes up by 1. Wrong: game over, showing streak and best, with "Play again".
- **Difficulty:** the challenger's count differs from the one that stays by a ratio band that tightens with the streak:
  - streak 0–2: ≥ 10×
  - 3–5: 4–10×
  - 6–9: 2–4×
  - 10+: 1.2–2×

  If no song fits the band, use the closest band that does.
- No artist repeats within one game in either mode.

## 7. Data for the modes

The modes work offline from the bundled catalog (`assets/catalogs/*.json` titles, previews and artwork, joined with `assets/genres.json` listener counts), which covers 1,255 artists with counts. There is no network apart from audio previews, and no Supabase.
- **Reveal cards** say "Last.fm listeners (Sept 2026)", because the counts are a snapshot.
- **Best streaks** per mode are kept in AsyncStorage. Profile shows "Best streaks: Spot the Star 7 · Head to Head 12".

## 8. Code shape

- `lib/game-pool.ts` (pure, tested):
  - `buildPool(catalogs, seeds): PoolSong[]`
  - `spotRound(pool, streak, used, rng): PoolSong[]`, returning 4 songs, shuffled
  - `challenger(pool, champion, streak, used, rng): PoolSong`
  - `ratioBand(streak)`
- `hooks/use-game-pool.ts` loads the catalog once.
- Tile grids for the guess screen and the modes share one `components/play/guess-tile.tsx`. A tile is blind or revealed.

## Testing

- **Unit tests:**
  - `spotRound` always returns exactly one ≥ 1M song and respects the streak ≥ 5 decoy rule.
  - `challenger` respects each ratio band and falls back to the closest band.
  - `ratioBand` covers every band boundary.
  - `buildPool` drops songs with no listener count.
- **Manual checks on a phone:**
  - Home shows no drop UI.
  - The Play tab shows all four drop states.
  - The results pager swipes both ways and autoplays.
  - Each mode can be won and lost, and the best streak persists across a restart.
