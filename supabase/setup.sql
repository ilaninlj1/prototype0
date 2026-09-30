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

-- Daily Drop guess: "which one has the most listeners?" One guess per phone per day.
create table guesses (
  day date not null references drops(day),
  device_id uuid not null,
  position smallint not null check (position between 0 and 4),
  created_at timestamptz not null default now(),
  primary key (day, device_id)
);

create view guess_results as
  select day, position, count(*)::int as count
  from guesses group by day, position;

alter table guesses enable row level security;

create policy insert_recent_guesses on guesses for insert to anon
  with check (day between (now() at time zone 'utc')::date - 2 and (now() at time zone 'utc')::date + 1);

grant select on guess_results to anon;

-- Song comments + one-word "vibes", visible only after a reveal (the app
-- enforces that). Anyone can read and post; there is no editing. A comment
-- reported by 3 different devices hides itself (Apple requires a report
-- path for user-generated content).

create table comments (
  id bigint generated always as identity primary key,
  track_id bigint not null,
  device_id uuid not null,
  name text not null default 'A listener' check (char_length(name) between 1 and 30),
  body text not null check (char_length(body) between 1 and 280),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_track on comments (track_id, created_at desc);

create table comment_reports (
  comment_id bigint not null references comments(id) on delete cascade,
  device_id uuid not null,
  primary key (comment_id, device_id)
);

create table vibes (
  track_id bigint not null,
  device_id uuid not null,
  word text not null check (char_length(word) between 1 and 24),
  primary key (track_id, device_id, word)
);

create view vibe_counts as
  select track_id, word, count(*)::int as count from vibes group by track_id, word;

alter table comments enable row level security;
alter table comment_reports enable row level security;
alter table vibes enable row level security;

create policy read_visible_comments on comments for select to anon using (not hidden);
create policy post_comments on comments for insert to anon with check (not hidden);
create policy report_comments on comment_reports for insert to anon with check (true);
create policy add_vibes on vibes for insert to anon with check (true);
grant select on vibe_counts to anon;

-- Three reports from different devices hide a comment.
create function hide_reported_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from comment_reports where comment_id = new.comment_id) >= 3 then
    update comments set hidden = true where id = new.comment_id;
  end if;
  return new;
end $$;

create trigger comment_reported after insert on comment_reports
  for each row execute function hide_reported_comment();

-- Daily chart snapshots, so the app can show what's rising. The first phone
-- to open a country's chart each day saves it; later copies are ignored.
create table chart_snapshots (
  day date not null,
  country text not null check (char_length(country) = 2),
  rank smallint not null check (rank between 1 and 100),
  track_id bigint not null,
  title text not null,
  artist text not null,
  artwork_url text,
  primary key (day, country, rank)
);

alter table chart_snapshots enable row level security;
create policy read_snapshots on chart_snapshots for select to anon using (true);
create policy save_snapshots on chart_snapshots for insert to anon
  with check (day between (now() at time zone 'utc')::date - 1 and (now() at time zone 'utc')::date + 1);

-- World Charts, part 2: save all 18 countries' charts every morning on
-- Supabase's own scheduler (no phone needed), and summarise each song's
-- history (peak position, days on chart) for the app.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Each song's history per country, for "peak #3 · 12 days on chart".
create view chart_track_stats as
  select country, track_id, min(rank)::int as peak, count(distinct day)::int as days_on_chart, min(day) as first_day
  from chart_snapshots
  group by country, track_id;
grant select on chart_track_stats to anon;

-- Which feed request belongs to which country (internal).
create table chart_feed_requests (country text primary key, request_id bigint not null);
alter table chart_feed_requests enable row level security;

-- Step 1: ask Apple for every country's chart (pg_net answers asynchronously).
create or replace function request_chart_feeds() returns void
language plpgsql security definer set search_path = public, net as $$
declare c text;
begin
  delete from chart_feed_requests;
  foreach c in array array['us','gb','br','za','ng','jp','kr','mx','co','in','ph','tr','eg','fr','de','se','es','au'] loop
    insert into chart_feed_requests (country, request_id)
    values (c, net.http_get('https://rss.applemarketingtools.com/api/v2/' || c || '/music/most-played/50/songs.json', timeout_milliseconds := 25000));
  end loop;
end $$;

-- Step 2, a few minutes later: store whatever came back. Days already saved
-- (by a phone or an earlier run) are left untouched.
create or replace function store_chart_feeds() returns void
language plpgsql security definer set search_path = public, net as $$
declare r record;
begin
  for r in
    select q.country, resp.content::jsonb -> 'feed' -> 'results' as results
    from chart_feed_requests q
    join net._http_response resp on resp.id = q.request_id
    where resp.status_code = 200
  loop
    insert into chart_snapshots (day, country, rank, track_id, title, artist, artwork_url)
    select current_date, r.country, x.ord::smallint, (x.item ->> 'id')::bigint, x.item ->> 'name', x.item ->> 'artistName', x.item ->> 'artworkUrl100'
    from jsonb_array_elements(r.results) with ordinality as x(item, ord)
    where x.ord <= 100
    on conflict do nothing;
  end loop;
end $$;

-- Only the scheduler (and the owner) may run these.
revoke execute on function request_chart_feeds() from public, anon, authenticated;
revoke execute on function store_chart_feeds() from public, anon, authenticated;
grant execute on function request_chart_feeds() to service_role;
grant execute on function store_chart_feeds() to service_role;

-- Every day (UTC): fetch at 05:15, store at 05:25; a second pass at 06:15 /
-- 06:25 fills in any country Apple timed out on the first time.
select cron.schedule('charts-request-1', '15 5 * * *', 'select request_chart_feeds()');
select cron.schedule('charts-store-1', '25 5 * * *', 'select store_chart_feeds()');
select cron.schedule('charts-request-2', '15 6 * * *', 'select request_chart_feeds()');
select cron.schedule('charts-store-2', '25 6 * * *', 'select store_chart_feeds()');
