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
  delete from chart_feed_requests where true; -- Supabase rejects a DELETE without WHERE
  foreach c in array array['us','gb','br','za','ng','jp','kr','mx','co','in','ph','tr','eg','fr','de','se','es','au'] loop
    insert into chart_feed_requests (country, request_id)
    values (c, net.http_get('https://rss.marketingtools.apple.com/api/v2/' || c || '/music/most-played/50/songs.json', timeout_milliseconds := 25000));
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
