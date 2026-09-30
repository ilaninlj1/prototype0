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
