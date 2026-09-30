# Taste Twins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opt-in matching with people who blind-liked the same songs, their saves to explore, and a mutual wave that swaps one handle (18+ only).

**Architecture:** Supabase anonymous sign-in gives each install a real user id; every Taste Twins table is keyed by `auth.uid()` with RLS, and the only ways to see other people's data are four security-definer functions. Matching counts come from SQL; the percent, ranking and all copy come from a pure, tested `lib/twins.ts`. Two new screens hang off a new Play-orbit mode.

**Tech Stack:** Expo Router 6 / React Native, Supabase (PostgREST + GoTrue over plain `fetch`, no client library), AsyncStorage, Node's test runner.

**Spec:** `docs/superpowers/specs/2026-09-30-taste-twins-design.md`

## Global Constraints

- No new npm dependencies. Plain `fetch` to Supabase, as in `lib/supabase.ts`.
- Percent: `evidence = 2·bothLiked + bothSkipped + 3·sameSongs + sameArtists`; `pct = round(100·evidence / (evidence + 1.5·disagreed + 4))`.
- A twin needs `bothLiked + bothSkipped + disagreed + sameSongs + sameArtists ≥ 3` and `pct ≥ 40`; show at most 5.
- Handles: Instagram / Snapchat / TikTok only; shown only after a mutual wave and only when both ticked 18+.
- Under-18: sees twins and songs; no Wave button, never sees a handle.
- Copy is plain, short, human; no emoji. Theme tokens from `constants/theme.ts` only.
- Phone app only (the web build serves `/pack` alone — `app/_layout.tsx` guard stays as is).
- Don't run formatters. Match surrounding code style.

## Review Focus

1. Anonymous session expired while the app was closed → the next call refreshes silently; offline refresh failure must not create a new account (that would orphan the profile). *(Task 3 test: `sessionNeedsRefresh`; code path reviewed.)*
2. A handle typed as a URL or with `@` ("instagram.com/maya", "@maya ") → stored clean, opens the right profile. *(Task 1 tests.)*
3. Someone blocked mid-session → disappears from the list on refresh, their songs and handle calls return nothing. *(Task 2 SQL verification.)*
4. User leaves Taste Twins → everything server-side is gone, local "joined" flag cleared, like-sync stops. *(Task 2 verification + Task 3 code.)*
5. A like made before joining → uploaded on join; a later unlike → removed server-side. *(Task 4 code path, verified by hand.)*

---

### Task 1: Matching, copy and handle rules (pure)

**Files:**
- Create: `lib/twins.ts`
- Test: `lib/twins.test.ts`

**Interfaces:**
- Produces:
  - `type Counts = { bothLiked: number; bothSkipped: number; disagreed: number; sameSongs: number; sameArtists: number }`
  - `matchPercent(c: Counts): number`, `isTwin(c: Counts): boolean`
  - `type TwinRow` (raw `my_twins()` row, snake_case) and `type Twin = { id: string; name: string; percent: number; counts: Counts; iWaved: boolean; theyWaved: boolean; canWave: boolean; summary: string }`
  - `rankTwins(rows: TwinRow[], limit?: number): Twin[]`
  - `twinSummary(c: Counts): string`
  - `type Platform = 'instagram' | 'snapchat' | 'tiktok'`; `cleanHandle(raw: string, platform: Platform): string | null`; `handleUrl(platform: Platform, handle: string): string`
  - `sessionNeedsRefresh(expiresAtSec: number, nowMs: number): boolean`

- [ ] **Step 1: Write the failing tests** — `lib/twins.test.ts`

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanHandle, handleUrl, isTwin, matchPercent, rankTwins, sessionNeedsRefresh, twinSummary, type Counts, type TwinRow } from './twins.ts';

const c = (over: Partial<Counts> = {}): Counts => ({ bothLiked: 0, bothSkipped: 0, disagreed: 0, sameSongs: 0, sameArtists: 0, ...over });
const row = (twin: string, over: Partial<TwinRow> = {}): TwinRow => ({
  twin, name: twin, both_liked: 0, both_skipped: 0, disagreed: 0, same_songs: 0, same_artists: 0,
  i_waved: false, they_waved: false, can_wave: true, ...over,
});

test('matchPercent: agreement raises it, disagreement lowers it, two lucky overlaps are not 100%', () => {
  assert.equal(matchPercent(c({ bothLiked: 1, sameSongs: 1 })), 56); // 5 / (5 + 4)
  assert.ok(matchPercent(c({ bothLiked: 6, sameSongs: 2 })) > 80);
  assert.ok(matchPercent(c({ bothLiked: 2, disagreed: 6 })) < 40);
  assert.equal(matchPercent(c()), 0);
});

test('isTwin: needs 3 overlapping data points and 40%', () => {
  assert.equal(isTwin(c({ sameSongs: 2 })), false); // only 2 points
  assert.equal(isTwin(c({ bothLiked: 2, sameSongs: 1 })), true);
  assert.equal(isTwin(c({ bothLiked: 1, disagreed: 5 })), false);
});

test('rankTwins: best match first, non-twins dropped, at most 5', () => {
  const rows = [
    row('a', { both_liked: 2, same_songs: 1 }),
    row('b', { both_liked: 6, same_songs: 3 }),
    row('c', { same_songs: 1 }),
    ...['d', 'e', 'f', 'g', 'h'].map((t) => row(t, { both_liked: 3 })),
  ];
  const twins = rankTwins(rows);
  assert.equal(twins.length, 5);
  assert.equal(twins[0].id, 'b');
  assert.ok(!twins.some((t) => t.id === 'c'));
  assert.equal(twins[0].summary, 'you both liked 9 songs blind');
});

test('twinSummary: says what you actually share', () => {
  assert.equal(twinSummary(c({ bothLiked: 1 })), 'you both liked 1 song blind');
  assert.equal(twinSummary(c({ bothSkipped: 4 })), 'you skip the same songs');
  assert.equal(twinSummary(c({ sameArtists: 3 })), 'you save the same artists');
});

test('cleanHandle: accepts @names and profile links, rejects junk', () => {
  assert.equal(cleanHandle(' @maya.b ', 'instagram'), 'maya.b');
  assert.equal(cleanHandle('https://www.instagram.com/maya_b/', 'instagram'), 'maya_b');
  assert.equal(cleanHandle('snapchat.com/add/maya-b', 'snapchat'), 'maya-b');
  assert.equal(cleanHandle('tiktok.com/@maya', 'tiktok'), 'maya');
  assert.equal(cleanHandle('maya b', 'instagram'), null);
  assert.equal(cleanHandle('', 'instagram'), null);
  assert.equal(cleanHandle('x'.repeat(31), 'instagram'), null);
});

test('handleUrl: opens the right profile', () => {
  assert.equal(handleUrl('instagram', 'maya.b'), 'https://instagram.com/maya.b');
  assert.equal(handleUrl('snapchat', 'maya-b'), 'https://snapchat.com/add/maya-b');
  assert.equal(handleUrl('tiktok', 'maya'), 'https://tiktok.com/@maya');
});

test('sessionNeedsRefresh: refresh within 5 minutes of expiry', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  assert.equal(sessionNeedsRefresh(now / 1000 + 3600, now), false);
  assert.equal(sessionNeedsRefresh(now / 1000 + 200, now), true);
  assert.equal(sessionNeedsRefresh(now / 1000 - 10, now), true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --test lib/twins.test.ts`
Expected: FAIL — `Cannot find module .../lib/twins.ts`

- [ ] **Step 3: Implement** — `lib/twins.ts`

```ts
// Taste Twins: who shares your ears, how much, and how to reach them once you
// both say so. Pure — the network side is lib/twins-api.ts.

export type Counts = { bothLiked: number; bothSkipped: number; disagreed: number; sameSongs: number; sameArtists: number };

/** One row of the database's my_twins(). */
export type TwinRow = {
  twin: string;
  name: string;
  both_liked: number;
  both_skipped: number;
  disagreed: number;
  same_songs: number;
  same_artists: number;
  i_waved: boolean;
  they_waved: boolean;
  can_wave: boolean;
};

export type Twin = { id: string; name: string; percent: number; counts: Counts; iWaved: boolean; theyWaved: boolean; canWave: boolean; summary: string };

const evidence = (c: Counts) => 2 * c.bothLiked + c.bothSkipped + 3 * c.sameSongs + c.sameArtists;

/** 0–100. The +4 keeps two lucky overlaps from reading as a perfect match. */
export function matchPercent(c: Counts): number {
  const e = evidence(c);
  return e === 0 ? 0 : Math.round((100 * e) / (e + 1.5 * c.disagreed + 4));
}

export function isTwin(c: Counts): boolean {
  const points = c.bothLiked + c.bothSkipped + c.disagreed + c.sameSongs + c.sameArtists;
  return points >= 3 && matchPercent(c) >= 40;
}

export function twinSummary(c: Counts): string {
  const liked = c.bothLiked + c.sameSongs;
  if (liked > 0) return `you both liked ${liked} ${liked === 1 ? 'song' : 'songs'} blind`;
  if (c.sameArtists > 0) return 'you save the same artists';
  return 'you skip the same songs';
}

export function rankTwins(rows: TwinRow[], limit = 5): Twin[] {
  return rows
    .map((r) => {
      const counts: Counts = { bothLiked: r.both_liked, bothSkipped: r.both_skipped, disagreed: r.disagreed, sameSongs: r.same_songs, sameArtists: r.same_artists };
      return { id: r.twin, name: r.name, percent: matchPercent(counts), counts, iWaved: r.i_waved, theyWaved: r.they_waved, canWave: r.can_wave, summary: twinSummary(counts) };
    })
    .filter((t) => isTwin(t.counts))
    .sort((a, b) => b.percent - a.percent || evidence(b.counts) - evidence(a.counts))
    .slice(0, limit);
}

export type Platform = 'instagram' | 'snapchat' | 'tiktok';

const PROFILE_PREFIX: Record<Platform, RegExp> = {
  instagram: /^(https?:\/\/)?(www\.)?instagram\.com\//i,
  snapchat: /^(https?:\/\/)?(www\.)?snapchat\.com\/add\//i,
  tiktok: /^(https?:\/\/)?(www\.)?tiktok\.com\/@?/i,
};

/** The bare username, from "@maya", "maya" or a profile link; null if it can't be a username. */
export function cleanHandle(raw: string, platform: Platform): string | null {
  const h = raw.trim().replace(PROFILE_PREFIX[platform], '').replace(/^@/, '').replace(/\/+$/, '');
  return /^[A-Za-z0-9._-]{1,30}$/.test(h) ? h : null;
}

export function handleUrl(platform: Platform, handle: string): string {
  if (platform === 'snapchat') return `https://snapchat.com/add/${handle}`;
  if (platform === 'tiktok') return `https://tiktok.com/@${handle}`;
  return `https://instagram.com/${handle}`;
}

/** Refresh the anonymous session when it has under 5 minutes left. */
export function sessionNeedsRefresh(expiresAtSec: number, nowMs: number): boolean {
  return expiresAtSec * 1000 - nowMs < 5 * 60_000;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --experimental-strip-types --test lib/twins.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/twins.ts lib/twins.test.ts
git commit -m "Taste Twins: matching, copy and handle rules (pure, tested)"
```

---

### Task 2: Database — tables, RLS, functions

**Files:**
- Create: `supabase/twins.sql`
- Create: `scripts/verify-twins.sh` (manual verification against the live project)

**Interfaces:**
- Produces (PostgREST): tables `twin_profiles`, `twin_likes`, `twin_waves`, `twin_blocks`, `twin_reports`; RPCs `my_twins()`, `twin_songs(twin uuid)`, `twin_handle(twin uuid)`, `leave_twins()`. All for role `authenticated` only.
- `twin_songs` returns `(track_id bigint, shared boolean)`; `twin_handle` returns `(handle text, platform text)`.

- [ ] **Step 1: Write `supabase/twins.sql`**

```sql
-- Taste Twins. Every row belongs to a Supabase anonymous-auth user
-- (auth.uid()). People only ever see each other through the four functions
-- at the bottom; handles leave the database only after a mutual wave
-- between two people who both said they're 18+.

create table twin_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  device_id uuid not null unique,
  name text not null check (char_length(name) between 1 and 30),
  handle text check (handle is null or char_length(handle) between 1 and 30),
  platform text check (platform is null or platform in ('instagram', 'snapchat', 'tiktok')),
  adult boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table twin_likes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  track_id bigint not null,
  artist_key text not null check (char_length(artist_key) between 1 and 120),
  primary key (user_id, track_id)
);

create table twin_waves (
  from_user uuid not null default auth.uid() references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user),
  check (from_user <> to_user)
);

create table twin_blocks (
  from_user uuid not null default auth.uid() references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  primary key (from_user, to_user)
);

create table twin_reports (
  reporter uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reported uuid not null references auth.users(id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (reporter, reported)
);

alter table twin_profiles enable row level security;
alter table twin_likes enable row level security;
alter table twin_waves enable row level security;
alter table twin_blocks enable row level security;
alter table twin_reports enable row level security;

revoke all on twin_profiles, twin_likes, twin_waves, twin_blocks, twin_reports from anon;
revoke all on twin_profiles from authenticated;
grant select, delete on twin_profiles to authenticated;
grant insert (device_id, name, handle, platform, adult) on twin_profiles to authenticated;
grant update (name, handle, platform, adult) on twin_profiles to authenticated; -- never `hidden`

create policy own_profile on twin_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_likes on twin_likes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_blocks on twin_blocks for all to authenticated
  using (from_user = auth.uid()) with check (from_user = auth.uid());
create policy own_reports on twin_reports for insert to authenticated with check (reporter = auth.uid());

-- Waving needs both people to have said they're 18+.
create function twin_is_adult(u uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select coalesce((select adult and not hidden from twin_profiles where user_id = u), false)
$$;
create policy adult_waves on twin_waves for insert to authenticated
  with check (from_user = auth.uid() and twin_is_adult(auth.uid()) and twin_is_adult(to_user));
create policy own_waves on twin_waves for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());

-- Three different reporters hide a profile from matching.
create function hide_reported_twin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from twin_reports where reported = new.reported) >= 3 then
    update twin_profiles set hidden = true where user_id = new.reported;
  end if;
  return new;
end $$;
create trigger twin_reported after insert on twin_reports for each row execute function hide_reported_twin();

create function twins_blocked(a uuid, b uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from twin_blocks where (from_user = a and to_user = b) or (from_user = b and to_user = a))
$$;

-- Raw overlap with every other visible member; lib/twins.ts turns it into a percent.
create function my_twins() returns table (
  twin uuid, name text, both_liked int, both_skipped int, disagreed int, same_songs int, same_artists int,
  i_waved boolean, they_waved boolean, can_wave boolean
)
language sql security definer set search_path = public stable as $$
  with me as (select user_id, device_id, adult from twin_profiles where user_id = auth.uid() and not hidden),
  others as (
    select p.user_id, p.device_id, p.name, p.adult from twin_profiles p, me
    where p.user_id <> me.user_id and not p.hidden and not twins_blocked(me.user_id, p.user_id)
  ),
  drop_overlap as (
    select o.user_id,
      count(*) filter (where a.liked and b.liked)::int as both_liked,
      count(*) filter (where not a.liked and not b.liked)::int as both_skipped,
      count(*) filter (where a.liked <> b.liked)::int as disagreed
    from others o
    join votes b on b.device_id = o.device_id
    join votes a on a.device_id = (select device_id from me) and a.day = b.day and a.position = b.position
    group by o.user_id
  ),
  song_overlap as (
    select t.user_id, count(*)::int as same_songs
    from twin_likes t join twin_likes m on m.user_id = auth.uid() and m.track_id = t.track_id
    where t.user_id in (select user_id from others)
    group by t.user_id
  ),
  artist_overlap as (
    select t.user_id, count(distinct t.artist_key)::int as same_artists
    from twin_likes t join twin_likes m on m.user_id = auth.uid() and m.artist_key = t.artist_key and m.track_id <> t.track_id
    where t.user_id in (select user_id from others)
    group by t.user_id
  )
  select o.user_id, o.name,
    coalesce(d.both_liked, 0), coalesce(d.both_skipped, 0), coalesce(d.disagreed, 0),
    coalesce(s.same_songs, 0), coalesce(ar.same_artists, 0),
    exists (select 1 from twin_waves w where w.from_user = auth.uid() and w.to_user = o.user_id),
    exists (select 1 from twin_waves w where w.from_user = o.user_id and w.to_user = auth.uid()),
    (select adult from me) and o.adult
  from others o
  left join drop_overlap d on d.user_id = o.user_id
  left join song_overlap s on s.user_id = o.user_id
  left join artist_overlap ar on ar.user_id = o.user_id
  where coalesce(d.both_liked, 0) + coalesce(d.both_skipped, 0) + coalesce(d.disagreed, 0)
      + coalesce(s.same_songs, 0) + coalesce(ar.same_artists, 0) >= 3
  order by 2 * coalesce(d.both_liked, 0) + coalesce(d.both_skipped, 0) + 3 * coalesce(s.same_songs, 0) + coalesce(ar.same_artists, 0) desc
  limit 20
$$;

-- A twin's songs: the Daily Drop songs you both liked, songs you both saved,
-- then the rest of what they saved. Track ids only.
create function twin_songs(twin uuid) returns table (track_id bigint, shared boolean)
language sql security definer set search_path = public stable as $$
  with ok as (
    select 1 from twin_profiles me, twin_profiles them
    where me.user_id = auth.uid() and them.user_id = twin and not them.hidden and not twins_blocked(auth.uid(), twin)
  ),
  drop_shared as (
    select distinct (d.songs -> a.position ->> 'itunesTrackId')::bigint as track_id, true as shared
    from ok, votes a
    join votes b on b.day = a.day and b.position = a.position and b.liked
    join drops d on d.day = a.day
    where a.liked
      and a.device_id = (select device_id from twin_profiles where user_id = auth.uid())
      and b.device_id = (select device_id from twin_profiles where user_id = twin)
  ),
  saves as (
    select t.track_id, exists (select 1 from twin_likes m where m.user_id = auth.uid() and m.track_id = t.track_id) as shared
    from ok, twin_likes t where t.user_id = twin
  )
  select track_id, bool_or(shared) from (select * from drop_shared union all select * from saves) x
  where track_id is not null
  group by track_id
  order by bool_or(shared) desc
  limit 40
$$;

create function twin_handle(twin uuid) returns table (handle text, platform text)
language sql security definer set search_path = public stable as $$
  select p.handle, p.platform from twin_profiles p
  where p.user_id = twin and p.handle is not null
    and twin_is_adult(auth.uid()) and twin_is_adult(twin)
    and not twins_blocked(auth.uid(), twin)
    and exists (select 1 from twin_waves where from_user = auth.uid() and to_user = twin)
    and exists (select 1 from twin_waves where from_user = twin and to_user = auth.uid())
$$;

create function leave_twins() returns void
language sql security definer set search_path = public as $$
  delete from twin_waves where from_user = auth.uid() or to_user = auth.uid();
  delete from twin_blocks where from_user = auth.uid();
  delete from twin_reports where reporter = auth.uid();
  delete from twin_likes where user_id = auth.uid();
  delete from twin_profiles where user_id = auth.uid();
$$;

revoke execute on function twin_is_adult(uuid), twins_blocked(uuid, uuid), my_twins(), twin_songs(uuid), twin_handle(uuid), leave_twins() from public, anon;
grant execute on function twin_is_adult(uuid), twins_blocked(uuid, uuid), my_twins(), twin_songs(uuid), twin_handle(uuid), leave_twins() to authenticated;
```

- [ ] **Step 2: The user runs it** — clipboard (`pbcopy < supabase/twins.sql`), then Supabase → SQL Editor → New query → paste → Run. Expected: "Success. No rows returned."

- [ ] **Step 3: Write `scripts/verify-twins.sh`** — two throwaway anonymous users exercise every rule, then leave.

```bash
#!/usr/bin/env bash
# Checks Taste Twins' rules against the live project with two throwaway
# anonymous users, then deletes their data. Usage: bash scripts/verify-twins.sh
set -euo pipefail
set -a; source .env.local; set +a
U=$EXPO_PUBLIC_SUPABASE_URL; K=$EXPO_PUBLIC_SUPABASE_ANON_KEY
signup() { curl -s -X POST "$U/auth/v1/signup" -H "apikey: $K" -H "Content-Type: application/json" -d '{}'; }
tok() { python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])"; }
uid() { python3 -c "import json,sys;print(json.load(sys.stdin)['user']['id'])"; }
A=$(signup); TA=$(echo "$A" | tok); IA=$(echo "$A" | uid)
B=$(signup); TB=$(echo "$B" | tok); IB=$(echo "$B" | uid)
call() { curl -s -X "$1" "$U/rest/v1/$2" -H "apikey: $K" -H "Authorization: Bearer $3" -H "Content-Type: application/json" -H "Prefer: return=minimal" ${4:+-d "$4"}; }
rpc() { curl -s -X POST "$U/rest/v1/rpc/$1" -H "apikey: $K" -H "Authorization: Bearer $2" -H "Content-Type: application/json" -d "${3:-{\}}"; }
call POST twin_profiles "$TA" "{\"device_id\":\"$(uuidgen)\",\"name\":\"Test A\",\"handle\":\"test_a\",\"platform\":\"instagram\",\"adult\":true}"
call POST twin_profiles "$TB" "{\"device_id\":\"$(uuidgen)\",\"name\":\"Test B\",\"handle\":\"test_b\",\"platform\":\"snapchat\",\"adult\":true}"
for t in 1 2 3; do call POST twin_likes "$TA" "{\"track_id\":$t,\"artist_key\":\"artist $t\"}"; call POST twin_likes "$TB" "{\"track_id\":$t,\"artist_key\":\"artist $t\"}"; done
echo "1. A sees B as a twin:      $(rpc my_twins "$TA" | grep -c "Test B" || true) (expect 1)"
echo "2. A can't read B's row:    $(call GET "twin_profiles?select=handle" "$TA")  (expect only A's handle)"
echo "3. Handle before waves:     $(rpc twin_handle "$TA" "{\"twin\":\"$IB\"}")  (expect [])"
call POST twin_waves "$TA" "{\"to_user\":\"$IB\"}"
echo "4. Handle after one wave:   $(rpc twin_handle "$TA" "{\"twin\":\"$IB\"}")  (expect [])"
call POST twin_waves "$TB" "{\"to_user\":\"$IA\"}"
echo "5. Handle after both waved: $(rpc twin_handle "$TA" "{\"twin\":\"$IB\"}")  (expect test_b)"
echo "6. Can't mark self hidden=false/true: $(call PATCH "twin_profiles?user_id=eq.$IA" "$TA" '{"hidden":true}')  (expect a permission error)"
call POST twin_blocks "$TB" "{\"to_user\":\"$IA\"}"
echo "7. After B blocks A, A sees: $(rpc my_twins "$TA")  (expect [])"
echo "8. After block, handle:     $(rpc twin_handle "$TA" "{\"twin\":\"$IB\"}")  (expect [])"
call PATCH "twin_profiles?user_id=eq.$IA" "$TA" '{"adult":false}'
echo "9. Under-18 wave refused:   $(call POST twin_waves "$TA" "{\"to_user\":\"$IB\"}")  (expect an RLS error)"
rpc leave_twins "$TA" >/dev/null; rpc leave_twins "$TB" >/dev/null
echo "10. After leaving, A's row: $(call GET "twin_profiles?select=user_id" "$TA")  (expect [])"
```

- [ ] **Step 4: Run it** — `bash scripts/verify-twins.sh`. Expected: every line matches its "(expect …)". Any mismatch is a SQL bug: fix `supabase/twins.sql`, re-run it in Supabase (drop and recreate the changed function), re-run this script.

- [ ] **Step 5: Commit**

```bash
git add supabase/twins.sql scripts/verify-twins.sh
git commit -m "Taste Twins: tables, RLS and functions, with a live verification script"
```

---

### Task 3: Anonymous session and the Taste Twins client

**Files:**
- Create: `lib/auth.ts`, `lib/twins-api.ts`

**Interfaces:**
- Consumes: `sessionNeedsRefresh`, `rankTwins`, `Twin`, `TwinRow`, `Platform` (Task 1); RPCs (Task 2); `loadDeviceId`, `loadLikedTracks` (`lib/discovery-storage.ts`); `lookupTracks` (`lib/song-details.ts`); `normalizeArtist` (`lib/human-check.ts`); `onLikeChange` (`components/like-button.tsx`).
- Produces:
  - `ensureSession(): Promise<{ token: string; userId: string } | null>`
  - `type MyProfile = { name: string; handle: string | null; platform: Platform | null; adult: boolean }`
  - `myProfile(): Promise<MyProfile | null>`, `saveProfile(p: MyProfile): Promise<boolean>`
  - `fetchTwins(): Promise<Twin[] | null>`
  - `fetchTwinSongs(id: string): Promise<{ shared: DiscoveryTrack[]; theirs: DiscoveryTrack[] }>`
  - `wave(id)`, `block(id)`, `report(id, reason)` → `Promise<boolean>`; `fetchHandle(id): Promise<{ handle: string; platform: Platform } | null>`
  - `leaveTwins(): Promise<boolean>`, `startTwinSync(): void`

- [ ] **Step 1: `lib/auth.ts`**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

import { sessionNeedsRefresh } from './twins';

// An invisible Supabase account per install (anonymous sign-in), used by
// Taste Twins so no one can act as someone else. Kept on the phone and
// refreshed before it expires. Only a server "no" ever creates a new one —
// being offline never does, or the listener would lose their profile.

const URL_ROOT = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const STORE = 'supabase-session-v1';

type Stored = { access_token: string; refresh_token: string; expires_at: number; user_id: string };
let pending: Promise<Stored | null> | null = null;

async function authCall(path: string, body: object): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${URL_ROOT}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

const toStored = (d: any): Stored => ({
  access_token: d.access_token,
  refresh_token: d.refresh_token,
  expires_at: d.expires_at ?? Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600),
  user_id: d.user.id,
});

async function load(): Promise<Stored | null> {
  let s: Stored | null = null;
  try {
    const raw = await AsyncStorage.getItem(STORE);
    s = raw ? JSON.parse(raw) : null;
  } catch {}
  try {
    if (s && !sessionNeedsRefresh(s.expires_at, Date.now())) return s;
    if (s) {
      const r = await authCall('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
      if (r.ok) s = toStored(r.data);
      else if (r.status >= 400 && r.status < 500) s = null; // revoked: start over
      else return null; // server trouble: try again later, keep the old one
    }
    if (!s) {
      const r = await authCall('signup', {});
      if (!r.ok) return null;
      s = toStored(r.data);
    }
    await AsyncStorage.setItem(STORE, JSON.stringify(s));
    return s;
  } catch {
    return null; // offline: keep what's stored
  }
}

export async function ensureSession(): Promise<{ token: string; userId: string } | null> {
  pending ??= load().finally(() => (pending = null));
  const s = await pending;
  return s ? { token: s.access_token, userId: s.user_id } : null;
}
```

- [ ] **Step 2: `lib/twins-api.ts`**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

import { onLikeChange } from '@/components/like-button';
import { ensureSession } from './auth';
import type { DiscoveryTrack } from './discovery';
import { loadDeviceId, loadLikedTracks } from './discovery-storage';
import { normalizeArtist } from './human-check';
import { lookupTracks } from './song-details';
import { rankTwins, type Platform, type Twin, type TwinRow } from './twins';

const URL_ROOT = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const JOINED = 'twins-joined-v1';

async function api(path: string, init: { method?: string; body?: unknown; prefer?: string } = {}): Promise<{ ok: boolean; data: any }> {
  const s = await ensureSession();
  if (!s || !URL_ROOT) return { ok: false, data: null };
  try {
    const res = await fetch(`${URL_ROOT}/rest/v1/${path}`, {
      method: init.method ?? 'GET',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${s.token}`,
        'Content-Type': 'application/json',
        ...(init.prefer ? { Prefer: init.prefer } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    return { ok: res.ok || res.status === 409, data: text ? JSON.parse(text) : null };
  } catch {
    return { ok: false, data: null };
  }
}
const rpc = (fn: string, args: object = {}) => api(`rpc/${fn}`, { method: 'POST', body: args });

export type MyProfile = { name: string; handle: string | null; platform: Platform | null; adult: boolean };

export async function myProfile(): Promise<MyProfile | null> {
  const r = await api('twin_profiles?select=name,handle,platform,adult');
  return r.ok && Array.isArray(r.data) && r.data[0] ? (r.data[0] as MyProfile) : null;
}

/** Join, or update what you share. Uploads your saved songs the first time. */
export async function saveProfile(p: MyProfile): Promise<boolean> {
  const body = { name: p.name, handle: p.adult ? p.handle : null, platform: p.adult && p.handle ? p.platform : null, adult: p.adult };
  const s = await ensureSession();
  if (!s) return false;
  const existing = await myProfile();
  const r = existing
    ? await api(`twin_profiles?user_id=eq.${s.userId}`, { method: 'PATCH', body, prefer: 'return=minimal' })
    : await api('twin_profiles', { method: 'POST', body: { ...body, device_id: await loadDeviceId() }, prefer: 'return=minimal' });
  if (!r.ok) return false;
  if (!existing) {
    await AsyncStorage.setItem(JOINED, 'true');
    const liked = await loadLikedTracks();
    if (liked.length) {
      await api('twin_likes', {
        method: 'POST',
        body: liked.map((t) => ({ track_id: t.id, artist_key: normalizeArtist(t.artistName) })),
        prefer: 'resolution=ignore-duplicates,return=minimal',
      });
    }
  }
  return true;
}

export async function fetchTwins(): Promise<Twin[] | null> {
  const r = await rpc('my_twins');
  return r.ok && Array.isArray(r.data) ? rankTwins(r.data as TwinRow[]) : null;
}

export async function fetchTwinSongs(id: string): Promise<{ shared: DiscoveryTrack[]; theirs: DiscoveryTrack[] }> {
  const r = await rpc('twin_songs', { twin: id });
  const rows = (r.ok && Array.isArray(r.data) ? r.data : []) as { track_id: number; shared: boolean }[];
  const tracks = await lookupTracks(rows.map((x) => x.track_id));
  const shared = new Set(rows.filter((x) => x.shared).map((x) => x.track_id));
  return { shared: tracks.filter((t) => shared.has(t.id)), theirs: tracks.filter((t) => !shared.has(t.id)).slice(0, 20) };
}

export const wave = async (id: string) => (await api('twin_waves', { method: 'POST', body: { to_user: id }, prefer: 'return=minimal' })).ok;
export const block = async (id: string) => (await api('twin_blocks', { method: 'POST', body: { to_user: id }, prefer: 'return=minimal' })).ok;
export const report = async (id: string, reason: string) =>
  (await api('twin_reports', { method: 'POST', body: { reported: id, reason }, prefer: 'return=minimal' })).ok;

export async function fetchHandle(id: string): Promise<{ handle: string; platform: Platform } | null> {
  const r = await rpc('twin_handle', { twin: id });
  return r.ok && Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
}

export async function leaveTwins(): Promise<boolean> {
  const r = await rpc('leave_twins');
  if (r.ok) await AsyncStorage.removeItem(JOINED);
  return r.ok;
}

/** Keep your saved songs in step with the server while you're a member. */
let syncing = false;
export function startTwinSync() {
  if (syncing) return;
  syncing = true;
  onLikeChange(async (id, liked) => {
    if ((await AsyncStorage.getItem(JOINED)) !== 'true') return;
    if (!liked) return void api(`twin_likes?track_id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
    const t = (await loadLikedTracks()).find((x) => x.id === id);
    if (t) api('twin_likes', { method: 'POST', body: { track_id: t.id, artist_key: normalizeArtist(t.artistName) }, prefer: 'resolution=ignore-duplicates,return=minimal' });
  });
}
```

- [ ] **Step 3: Type-check** — Run: `npx tsc --noEmit`. Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add lib/auth.ts lib/twins-api.ts
git commit -m "Taste Twins: anonymous session and client"
```

---

### Task 4: Screens, emblem, Play mode, like sync

**Files:**
- Create: `app/twins.tsx` (join form or twin list), `app/twin.tsx` (one twin)
- Modify: `components/emblems.tsx` (add `TasteTwinsEmblem`), `app/(tabs)/play.tsx` (mode after DJ Picks), `app/_layout.tsx` (routes + `startTwinSync()` once on boot)

**Interfaces:**
- Consumes: everything Task 3 produces; `handleUrl`, `cleanHandle`, `Platform`, `Twin` (Task 1); `usePlayback`, `LikeButton`, `AppleMusicLink`, `PressableScale`, `ThemedText` (existing).
- Produces: routes `/twins` and `/twin?id&name&percent&summary&iWaved&theyWaved&canWave`.

- [ ] **Step 1: Emblem** — append to `components/emblems.tsx`:

```tsx
/** Taste Twins: two circles of taste, the overlap in red. */
export function TasteTwinsEmblem({ size = 52 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Circle {...FILL} cx={24} cy={34} r={17} />
      <Circle {...FILL} cx={40} cy={34} r={17} fillOpacity={0.85} />
      <Path fill={RED} d="M32 19.2 A17 17 0 0 1 32 48.8 A17 17 0 0 1 32 19.2 Z" />
      <Path {...LINE} d="M24 17 A17 17 0 1 0 24 51 M40 17 A17 17 0 1 1 40 51" opacity={0.5} />
    </Svg>
  );
}
```

- [ ] **Step 2: `app/twins.tsx`** — two states on one screen.
  - **Not joined:** name field (prefilled from `loadSenderName()`), "I'm 18 or older" checkbox, and — only when ticked — a platform segment (None / Instagram / Snapchat / TikTok) with a handle field validated by `cleanHandle` ("That doesn't look like a username" under the field when it fails). Three plain lines of what's shared: "Your name and the songs you saved or voted on in the Daily Drop are used to find people with your taste." / "Your handle stays hidden until you both wave." / "Leave any time and it's all deleted." Button **Find my twins** → `saveProfile` → list state. Failure copy: "Couldn't join just now. Check your connection."
  - **Joined:** eyebrow "Taste Twins", title "People with your ears". On focus: `fetchTwins()`. Each twin row (PressableScale, surface card): name, `percent%` in `Colors.signal` display font, `summary`, and a small "waved at you" tag in `Colors.highlight` when `theyWaved && !iWaved`. Tap → `router.push({ pathname: '/twin', params: { id, name, percent: String(percent), summary, iWaved: String(iWaved), theyWaved: String(theyWaved), canWave: String(canWave) } })`. Empty: "No twins yet. They show up once someone overlaps with you — the Daily Drop gets you there fastest." Footer links: "Edit what I share" (back to the form, prefilled from `myProfile()`) and "Leave Taste Twins" (`Alert.alert` confirm → `leaveTwins()` → form state).
  - Loading: `ActivityIndicator`. Session failure (`ensureSession` null): "Taste Twins needs a connection."

- [ ] **Step 3: `app/twin.tsx`** — one twin.
  - Header: back chevron, eyebrow "Taste twin", title `name`, `percent%` + `summary`.
  - Wave area: `canWave === false` → nothing. Not waved → **Wave** button (`wave(id)` → "Waved. If they wave back, you'll see each other's handle."). Waved, they haven't → "Waved — waiting on them." Both waved → `fetchHandle(id)`: "@handle on Instagram" + **Open** (`Linking.openURL(handleUrl(platform, handle))`); if null (no handle shared) → "You both waved. They didn't share a handle."
  - `fetchTwinSongs(id)`: section "You both liked, blind" (shared), then "Also in their saves" (theirs). Rows: art, title, artist, play/pause via `usePlayback` (`player.replace(previewUrl); player.play()`; pause on blur with `useFocusEffect`), `LikeButton`, `AppleMusicLink height={26}`. Credit line at bottom.
  - Footer: **Block** (`Alert` confirm "They won't see you and you won't see them." → `block(id)` → `router.back()`), **Report** (`Alert` with reasons "Fake or spam", "Offensive name", "Something else" → `report(id, reason)` → "Thanks. We'll take a look.").

- [ ] **Step 4: Play mode** — in `app/(tabs)/play.tsx` import `TasteTwinsEmblem` and add after the `dj` mode:

```tsx
    {
      key: 'twins',
      emblem: (s) => <TasteTwinsEmblem size={s} />,
      eyebrow: 'People · opt in',
      title: 'Taste Twins',
      blurb: 'Find the people who liked the same songs blind. See what else they saved. If you both wave, swap a handle.',
      stat: '2',
      statLabel: 'waves to connect',
      cta: 'Find my twins',
      href: '/twins',
    },
```

- [ ] **Step 5: Routes and sync** — in `app/_layout.tsx` add `<Stack.Screen name="twins" options={{ headerShown: false }} />` and `<Stack.Screen name="twin" options={{ headerShown: false }} />` next to `dj-picks`, and call `startTwinSync()` once in the root layout's existing mount effect (import from `@/lib/twins-api`).

- [ ] **Step 6: Verify** — `npx tsc --noEmit` (no output); `npx expo lint` (only the 3 known errors); full suite `node --experimental-strip-types --test lib/*.test.ts scripts/*.test.ts components/discovery/*.test.ts` (all pass); bundle both platforms from Metro (`curl …entry.bundle?platform=ios` and `android` → 200).

- [ ] **Step 7: Commit**

```bash
git add app/twins.tsx app/twin.tsx components/emblems.tsx "app/(tabs)/play.tsx" app/_layout.tsx
git commit -m "Taste Twins: join, twins list, twin page with wave, block and report"
```

---

### Final: whole-branch review

- [ ] Dispatch a fresh reviewer (most capable model) on the branch diff with the spec, this plan, and the Review Focus list. Fix Critical/Important with a failing test first where testable; ledger minors.
- [ ] Merge to `main` after a clean suite.
