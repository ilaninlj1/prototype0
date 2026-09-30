# Taste Twins — design

**Date:** 2026-09-30 · **Status:** approved in chat (option A: mutual wave; waving 18+)

## Why
Research (see `features.md` 2026-09-30): one of the most-liked ways people find music is finding
someone with the same taste and going through what they save. Blindspot has a fair way to measure
taste: everyone rates the same 5 Daily Drop songs every day, blind, and saves songs blind. Taste Twins
turns that into "people like you", and lets two people who both want to connect swap a handle.

## What the listener gets
1. **Opt in** (Play → Taste Twins): a display name (1–30 chars), optionally one handle
   (Instagram / Snapchat / TikTok) and a tick box "I'm 18 or older". Copy says plainly what is shared.
   **Leave** deletes everything on the server.
2. **Your twins:** up to 5, best first — `Maya · 82% · you both liked 4 songs blind`. When there's no
   one yet: "Twins show up once someone overlaps with you. Play the Daily Drop to get there faster."
3. **A twin's page:** songs you both liked blind, then up to 20 other songs they saved (play, like).
   **Wave** button (18+ on both sides only). When both waved: their handle and an Open button.
   **Block** (they vanish for you, you for them) and **Report** (3 different reporters hide a profile).

## Matching
Raw counts per pair, computed in the database:
- Daily Drop: `bothLiked`, `bothSkipped`, `disagreed` over (day, position) both voted on.
- Saves: `sameSongs` (same iTunes track id), `sameArtists` (same normalized artist, other songs).

Percent, computed in `lib/twins.ts` (pure, tested):
`evidence = 2·bothLiked + bothSkipped + 3·sameSongs + sameArtists`,
`pct = round(100 · evidence / (evidence + 1.5·disagreed + 4))` — the `+4` keeps two lucky overlaps
from reading as 100%. A pair is a twin only with **at least 3 overlapping data points**
(`bothLiked + bothSkipped + disagreed + sameSongs + sameArtists ≥ 3`) and `pct ≥ 40`.

## Identity and safety
- **Supabase anonymous sign-in** (a real, invisible account per install; token kept in AsyncStorage
  and refreshed). Every Taste Twins table is keyed by `auth.uid()`, so no one can act as someone
  else. The user flips "Allow anonymous sign-ins" once in the dashboard. Existing features keep the
  plain public key for now (moving comments/reports over is a later task).
- Handles live in a table nobody can read directly; the only way out is `twin_handle(twin)`, which
  returns it only when **both** waved and **both** ticked 18+.
- Other people's saves are reachable only through `twin_songs(twin)`, which returns track ids, never
  device ids or times. Names are the only identity shown.
- Blocked pairs and hidden (3× reported) profiles are excluded from matching both ways.
- Under-18 (box unticked): sees twins and their songs; no Wave, no handle, and never shown a handle.

## Data (Supabase, `supabase/twins.sql`)
- `twin_profiles(user_id pk → auth.users, device_id uuid unique, name, handle, platform, adult,
  hidden, created_at)` — RLS: each user reads/writes only their own row.
- `twin_likes(user_id, track_id, artist_key)` — own rows only.
- `twin_waves(from_user, to_user)`, `twin_blocks(from_user, to_user)`,
  `twin_reports(reporter, reported, reason)` — insert/read own; a report trigger hides at 3.
- Security-definer functions (search_path pinned, execute to `authenticated` only):
  `my_twins()`, `twin_songs(twin)`, `twin_handle(twin)`, `leave_twins()`.
- `my_twins()` joins `twin_profiles.device_id` to the existing `votes` table for Daily Drop overlap.

## App
- `lib/twins.ts` (pure): `matchPercent`, `isTwin`, `rankTwins`, `twinSummary`, `cleanHandle`,
  `handleUrl`. Tests first.
- `lib/auth.ts`: `ensureSession()` — stored session → refresh if near expiry → anonymous sign-up.
- `lib/twins-api.ts`: join/update, sync likes (all on join; then each save/unsave via
  `onLikeChange`), twins, twin songs, wave, handle, block, report, leave.
- `app/twins.tsx` (opt-in or list), `app/twin.tsx` (a twin's page), Play orbit mode with a new emblem.

## Out of scope
In-app chat, push notifications for waves (the list shows "waved at you"), moving other features to
signed-in accounts, web (phone app only).

## Verification
Pure tests for matching, summaries and handles. After the SQL runs: two anonymous users created with
curl, overlapping likes, one-sided wave (no handle), mutual wave (handle), block (gone both ways),
under-18 wave refused.
