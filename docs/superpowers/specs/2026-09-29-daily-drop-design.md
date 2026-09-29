# Daily Drop

**Goal.** Give people a reason to open Blindspot *today*. Every day everyone
gets the same 5 songs, swiped blind. When you finish, all 5 reveal at once
together with how everyone else voted. The model is Wordle (one puzzle a day,
the same for everyone, a spoiler-free share). The research framing is
MusicLab (independent blind judgments first, crowd signal only afterwards).

**Scope: a working class prototype for the December showcase.** It should be
cheap to build and cheap to run. Non-goals: accounts, streaks, leaderboards, a
live showcase dashboard, scheduled servers, automatic song refresh, and App
Store launch hardening.

## 1. How the songs are picked (offline script)

`npm run make-drops` (`scripts/make-drops.ts`) builds every missing day from
today through 2026-12-31 into `drops/drops.json`. `npm run upload-drops` then
pushes that file to Supabase. The phone never picks songs.

**Shape of each drop:** one song per slot, stored in shuffled order.

| Slot id | Artist Last.fm listeners | Track choice |
|---|---|---|
| `buried` | < 5,000 | artist's top 3 by Last.fm rank |
| `tiny` | 5,000–19,999 | top 3 |
| `radar` | 20,000–99,999 | top 3 |
| `known` | 100,000–999,999 | top 3 |
| `famous` | ≥ 1,000,000 | a lesser-known song: Last.fm rank 11–50 |

**Rules**
- Artists come from `assets/genres-raw.json`, using only entries with an `itunesArtistId`.
- The 5 songs in a drop come from 5 different genres.
- No artist repeats across the whole run.
- Listener counts come from a fresh Last.fm `artist.getInfo` call when the drop is made. That count is the "found at" number for anyone who likes the song. The artist's slot is decided by this fresh count, not by the September seed value.
- A candidate is kept only if an iTunes US lookup (`lookup?id=<artistId>&entity=song&limit=200`) returns a normalized title match with a `previewUrl`, **and** the track is not explicit (`trackExplicitness !== 'explicit'`), since this is for a classroom. A candidate that fails is replaced by the next track, then by the next artist.
- iTunes calls are serialized with ≥ 3s between them (per `features.md`, 2026-09-14). Last.fm calls wait 250ms between them.
- The script is resumable. Progress is written to `drops/drops.json` after every completed day, so a stop or block loses at most one day.
- `--dry-run` picks and verifies but writes nothing.

**Fixing and curating**
- `npm run review-drops` writes `drops/review.html`, a local page listing upcoming days. Each song has an audio player, and each slot has a copyable swap command.
- `npm run make-drops -- --redo 2026-11-03 --slot tiny` re-picks one slot. Leave out `--slot` to redo the whole day. **Only future days can be redone.** Votes are keyed by position, so changing a day people have already played would scramble its results. The script refuses dates up to and including today.
- `npm run make-drops -- --showcase 2026-12-10` stores **3 candidates per slot** for that date. The review page shows all 15. `npm run make-drops -- --choose 2026-12-10 radar=2 buried=1 ...` saves the picks, one per slot. Until every slot has a choice, that day is not uploaded.

## 2. How you play it

- A drop is keyed by the **device's local date** (`YYYY-MM-DD`). Drop number = days since the first drop + 1.
- On Home, if today's drop exists and isn't finished, **the first 5 cards of the stack are the drop.** The genre pill reads "Daily Drop · n/5". After the 5th card, the normal feed continues.
- Right = like, left = skip. **Swiping down is disabled** during the drop. Tune and the preset don't apply to it.
- **No per-song reveal during the drop.** A right swipe shows a brief "Liked" flash. The reveal happens on the results screen.
- **Undo works until the 5th swipe.** Votes are held on the phone and sent all together when the drop is finished.
- A missed day is gone. No drop, no network, or a failed load means the app silently starts the normal feed.
- Drop likes go into the Liked list with `artistListeners` (the drop's found-at count) and `likedAt`, so "Called it" applies to them. The swipe log records them with `source: 'drop'`.

## 3. The results screen (`app/drop-results.tsx`)

- The 5 songs reveal in drop order, with a staggered flip about 0.5s apart. Each row shows the artwork, song, artist, listener count, your vote (♥ / ✕), and a crowd bar.
- **Crowd label:** while voters < 20 it reads "4 of 6 liked"; at 20 or more it reads "71% liked". Your own votes count toward the total.
- The `famous` slot is labelled "The secret famous one" once revealed.
- **The headline** is chosen from two options. The famous slot exists in every drop, so its line is the fallback:
  1. if you liked a song whose crowd like-share is ≤ 25% with voters ≥ 5 (the lowest share wins): "You're one of only 12% who liked <artist>."
  2. otherwise, the famous slot: "You skipped a song with 3.2M listeners — so did 62% of people." / "You spotted it — 3.2M listeners." Before 5 voters, the crowd half is left out.
- **Share** (text via the share sheet, no artist names):
  ```
  Blindspot Daily #12
  💜🖤💜💜🖤
  Liked 3 blind · 1 under 5K listeners
  ```
  💜 = liked and 🖤 = skipped, in drop order. The second line leaves out the "under 5K" part when there are none.
- **"Keep swiping"** closes the screen and continues into the feed.
- Profile gets a top line, "Today's drop: liked 3/5 · see results", which reopens the screen with fresh crowd numbers.
- While offline, the crowd bars read "Results when you're back online". Your own reveal still shows.

## 4. Data

The app uses Supabase's REST API with plain `fetch`, adding no dependency.

`supabase/setup.sql`:

```sql
create table drops (
  day date primary key,
  number int not null,
  songs jsonb not null  -- array of 5: {slot, itunesTrackId, title, artist, artworkUrl, previewUrl, genre, listeners}
);

create table votes (
  day date not null references drops(day),
  device_id uuid not null,
  position smallint not null check (position between 0 and 4),
  liked boolean not null,
  created_at timestamptz not null default now(),
  primary key (day, device_id, position)
);

create view drop_results as
  select day, position, count(*)::int as voters, count(*) filter (where liked)::int as likes
  from votes group by day, position;

alter table drops enable row level security;
alter table votes enable row level security;

-- Anyone can read today's drop (+1 day for time zones ahead of UTC), never further ahead.
create policy read_current_drops on drops for select to anon
  using (day <= (now() at time zone 'utc')::date + 1);

-- Anyone can add a vote for a recent day. There is no update, delete, or row read.
create policy insert_recent_votes on votes for insert to anon
  with check (day between (now() at time zone 'utc')::date - 2 and (now() at time zone 'utc')::date + 1);

grant select on drop_results to anon;  -- the view runs as its owner, so counts are readable but rows are not
```

**Client modules**
- `lib/daily-drop.ts` (pure, tested): `todayKey`, `crowdLabel`, `pickHeadline`, `shareText`, `dropToDiscoveryTracks`.
- `lib/supabase.ts`: `fetchDrop(day)`, `sendVotes(day, deviceId, votes)`, and `fetchResults(day)`. Votes are posted with `Prefer: resolution=ignore-duplicates`, so resends are safe.
- `lib/discovery-storage.ts` additions: `deviceId` (random UUID, made once), the cached drop for today, in-progress drop votes, and pending unsent votes.
- **Environment:**
  - `.env.local` gets `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The anon key is safe to ship because of row-level security.
  - `SUPABASE_SERVICE_KEY` is used by the scripts only. It has no `EXPO_PUBLIC_` prefix, so it is never bundled.

**Setup (about 10 min, done by Ilan):** create a free Supabase project →
run `supabase/setup.sql` in the SQL Editor → copy the URL, anon key and
service key into `.env.local` → `npm run make-drops` → `npm run upload-drops`.

**Queries for the paper**
```sql
-- Share of voters who liked the secret famous song, per day
select d.day, r.likes::float / r.voters as like_share
from drops d join drop_results r on r.day = d.day
join lateral jsonb_array_elements(d.songs) with ordinality s(song, i) on i - 1 = r.position
where s.song->>'slot' = 'famous';

-- Like rate by obscurity slot, all days
select s.song->>'slot' as slot, sum(r.likes)::float / sum(r.voters) as like_rate
from drops d join drop_results r on r.day = d.day
join lateral jsonb_array_elements(d.songs) with ordinality s(song, i) on i - 1 = r.position
group by 1 order by 2 desc;
```

## Error handling
- Every network call fails soft. The feed never waits on Supabase.
- The drop is cached after its first load, so a mid-drop network drop doesn't lose it.
- Unsent votes are retried on each app open until they succeed.
- If a stored preview won't play (`previewUrl` expired), the card still counts as a skip for that song. It stays broken for that day, because past days can't be redone. The review page is where these get caught beforehand.

## Testing
- `lib/daily-drop.test.ts`: crowd label at the 20-voter threshold, both headline branches (including the under-5-voters wording), share text with and without buried likes, and `todayKey` around midnight.
- Pure helpers in the script (slot assignment by listeners, genre and artist uniqueness, title matching, explicit filter) get their own tests.
- Run `make-drops --dry-run` before the first real run.

## Risks
- **Supabase free projects pause after 7 days without activity.** Restoring takes one click. Open the app in the week before the showcase.
- **The iTunes rate limit.** The first full run takes about 30–40 minutes and can be resumed.
- **Small crowds.** The "n of m" wording keeps early numbers honest.
