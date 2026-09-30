-- Taste Twins fixes from the code review. Safe to run on top of twins.sql.

-- 1. If a phone ever gets a fresh anonymous account, it can take its profile
--    back with its device id (never readable by anyone else), instead of
--    leaving an orphan it can't delete and can't rejoin over.
create or replace function claim_twin_profile(device uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare old uuid;
begin
  if exists (select 1 from twin_profiles where user_id = auth.uid()) then return false; end if;
  select user_id into old from twin_profiles where device_id = device;
  if old is null or old = auth.uid() then return false; end if;
  delete from twin_likes where user_id = auth.uid(); -- strays synced before the claim
  update twin_likes set user_id = auth.uid() where user_id = old;
  update twin_waves set from_user = auth.uid() where from_user = old;
  update twin_waves set to_user = auth.uid() where to_user = old;
  update twin_blocks set from_user = auth.uid() where from_user = old;
  update twin_blocks set to_user = auth.uid() where to_user = old;
  update twin_reports set reporter = auth.uid() where reporter = old;
  update twin_reports set reported = auth.uid() where reported = old;
  update twin_profiles set user_id = auth.uid() where user_id = old;
  return true;
end $$;
revoke execute on function claim_twin_profile(uuid) from public, anon;
grant execute on function claim_twin_profile(uuid) to authenticated;

-- 2. Leaving and rejoining doesn't wash away 3 reports, and profiles are only
--    ever deleted through leave_twins() (which cleans up everything else).
create or replace function keep_twin_hidden() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.hidden := (select count(*) >= 3 from twin_reports where reported = new.user_id);
  return new;
end $$;
drop trigger if exists twin_profile_hidden on twin_profiles;
create trigger twin_profile_hidden before insert on twin_profiles for each row execute function keep_twin_hidden();
revoke delete on twin_profiles from authenticated;

-- 3. Names are shown to every twin (under-18s too), so they can't carry a way
--    to reach someone. Same rule as lib/twins.ts nameLooksLikeContact.
alter table twin_profiles drop constraint if exists twin_name_no_contact;
alter table twin_profiles add constraint twin_name_no_contact
  check (name !~* '(@|/|\.(com|net|org|me|gg)\M|[0-9]{4,}|insta|snap|tiktok|whatsapp|discord|telegram|phone|call me|text me)');

-- 4. Only the database's own functions check blocks; no one can ask who blocked whom.
revoke execute on function twins_blocked(uuid, uuid) from authenticated;

-- 5. Daily Drop songs count once (as Daily Drop agreement), not again as a shared save.
create or replace function my_twins() returns table (
  twin uuid, name text, both_liked int, both_skipped int, disagreed int, same_songs int, same_artists int,
  i_waved boolean, they_waved boolean, can_wave boolean
)
language sql security definer set search_path = public stable as $$
  with me as (select user_id, device_id, adult from twin_profiles where user_id = auth.uid() and not hidden),
  others as (
    select p.user_id, p.device_id, p.name, p.adult from twin_profiles p, me
    where p.user_id <> me.user_id and not p.hidden and not twins_blocked(me.user_id, p.user_id)
  ),
  drop_tracks as (
    select distinct (s ->> 'itunesTrackId')::bigint as track_id from drops, jsonb_array_elements(songs) s
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
    where t.user_id in (select user_id from others) and t.track_id not in (select track_id from drop_tracks)
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
