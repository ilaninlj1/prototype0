-- People: you swipe the song, not the person. Run once, on top of twins.sql and
-- twins-fixes.sql. It reuses their profiles, hearts (twin_likes), waves, blocks and
-- reports, so the safety rules carry over. Spec docs/superpowers/specs/2026-11-02-people-design.md.

alter table twin_profiles add column intent text check (intent is null or intent in ('friends', 'dating', 'either'));
alter table twin_profiles add column print jsonb not null default '[]'
  check (jsonb_typeof(print) = 'array' and jsonb_array_length(print) <= 12);
alter table twin_profiles add column people_at timestamptz; -- set only by join_people()

alter table twin_profiles drop constraint if exists twin_profiles_platform_check;
alter table twin_profiles add constraint twin_profiles_platform_check
  check (platform is null or platform in ('instagram', 'snapchat', 'tiktok', 'discord'));

grant insert (intent, print) on twin_profiles to authenticated;
grant update (intent, print) on twin_profiles to authenticated;

-- Every verdict in the People deck. A heart here is also a row in twin_likes, which is
-- the record of hearts everywhere; taking the heart off later turns it into a pass.
create table people_swipes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  track_id bigint not null check (track_id > 0),
  hearted boolean not null,
  at timestamptz not null default now(),
  primary key (user_id, track_id)
);

-- The bars for "in tune", one row. Change them in the dashboard; no new build needed.
create table people_settings (
  id boolean primary key default true check (id),
  min_shared int not null default 3,
  min_rated int not null default 15,
  min_score real not null default 1.25,
  max_rate real not null default 0.6,
  catalog_size int not null default 10889,
  waves_per_day int not null default 10
);
insert into people_settings default values;

-- Every pair ever shown, with its score, so wave and wave-back rates can be read by score.
create table people_shown (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person uuid not null references auth.users(id) on delete cascade,
  first_shown_at timestamptz not null default now(),
  last_shown_at timestamptz not null default now(),
  first_score real not null,
  score real not null,
  shared int not null,
  rated int not null,
  primary key (user_id, person)
);

alter table people_swipes enable row level security;
alter table people_settings enable row level security;
alter table people_shown enable row level security;
revoke all on people_swipes, people_settings, people_shown from anon, authenticated;

-- Friends with Dating is no match. Friends with anything else stays friends, so nobody
-- gets a dating wave they didn't ask for.
create function people_mode(a text, b text) returns text
language sql immutable set search_path = public as $$
  select case
    when a is null or b is null then null
    when (a = 'friends' and b = 'dating') or (a = 'dating' and b = 'friends') then null
    when a = 'friends' or b = 'friends' then 'friends'
    when a = 'dating' or b = 'dating' then 'dating'
    else 'either'
  end
$$;

create function people_member(u uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select coalesce((select adult and not hidden and people_at is not null and intent is not null from twin_profiles where user_id = u), false)
$$;

-- The moment you agree. Needs a profile that said 18+ and picked what it's open to.
create function join_people() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update twin_profiles set people_at = coalesce(people_at, now())
  where user_id = auth.uid() and adult and intent is not null and not hidden;
  return found;
end $$;

-- Your deck: songs hearted by people you could match, that you haven't judged. At most half
-- from any one person, closest people first. hearted_by stays hidden until your verdict.
create function people_deck(lim int default 12) returns table (track_id bigint, hearted_by int)
language sql security definer set search_path = public as $$
  with me as (select user_id, intent from twin_profiles where user_id = auth.uid() and people_member(auth.uid())),
  others as (
    select p.user_id from twin_profiles p, me
    where p.user_id <> me.user_id and people_member(p.user_id) and not twins_blocked(me.user_id, p.user_id)
      and people_mode(me.intent, p.intent) is not null
  ),
  closeness as (
    select o.user_id, count(m.track_id) as shared
    from others o
    join twin_likes t on t.user_id = o.user_id
    left join twin_likes m on m.user_id = auth.uid() and m.track_id = t.track_id
    group by o.user_id
  ),
  hearts as (
    select t.track_id, t.user_id, c.shared, row_number() over (partition by t.user_id order by random()) as n
    from twin_likes t join closeness c on c.user_id = t.user_id
    where not exists (select 1 from people_swipes s where s.user_id = auth.uid() and s.track_id = t.track_id)
      and not exists (select 1 from twin_likes m where m.user_id = auth.uid() and m.track_id = t.track_id)
  ),
  hearted as (select h.track_id, count(*)::int as by_count from hearts h group by h.track_id)
  select h.track_id, a.by_count
  from hearts h join hearted a on a.track_id = h.track_id
  where h.n <= greatest(3, ceil(least(greatest(lim, 1), 50) / 2.0))
  group by h.track_id, a.by_count
  order by max(h.shared) desc, random()
  limit least(greatest(lim, 1), 50)
$$;

-- One verdict. A heart also goes in twin_likes in the same step, so it counts at once.
create function people_swipe(p_track bigint, p_hearted boolean, p_artist_key text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not people_member(auth.uid()) or p_track is null or p_track <= 0 or p_hearted is null then return false; end if;
  if char_length(coalesce(p_artist_key, '')) not between 1 and 120 then return false; end if;
  insert into people_swipes (user_id, track_id, hearted) values (auth.uid(), p_track, p_hearted)
    on conflict (user_id, track_id) do update set hearted = excluded.hearted, at = now();
  if p_hearted then
    insert into twin_likes (user_id, track_id, artist_key) values (auth.uid(), p_track, p_artist_key)
      on conflict do nothing;
  end if;
  return true;
end $$;

-- How likely u is to heart a song by chance, when judging a match with p_other. Measured on cards
-- that aren't p_other's hearts, or a small group would measure the match against itself; with nothing
-- to go on, the +1 and +5 start near one in five. Two things override it: someone hearting most cards
-- isn't choosing, and a huge Library (or a script hearting every song) is expected to overlap.
create function people_rate(u uuid, p_other uuid) returns real
language sql security definer set search_path = public stable as $$
  with st as (select * from people_settings limit 1),
  overall as (select (count(*) filter (where s.hearted) + 1.0) / (count(*) + 5.0) as rate from people_swipes s where s.user_id = u),
  apart as (
    select (count(*) filter (where s.hearted) + 1.0) / (count(*) + 5.0) as rate from people_swipes s
    where s.user_id = u and not exists (select 1 from twin_likes l where l.user_id = p_other and l.track_id = s.track_id)
  ),
  library as (select count(*)::real / greatest((select catalog_size from st), 1) as rate from twin_likes l where l.user_id = u)
  select greatest(case when overall.rate >= st.max_rate then overall.rate else apart.rate end, library.rate)::real
  from st, overall, apart, library
$$;

-- The one definition of a pair's overlap, for you and p_person. Chance takes the larger direction,
-- so one generous swiper can't make a match; the +1s pull small samples toward "unknown". Skips never count.
create function people_overlap(p_person uuid) returns table (
  shared_tracks bigint[], both_rated int, they_hearted_i_rated int, i_hearted_they_rated int, expected real, score real, in_tune boolean
)
language sql security definer set search_path = public stable as $$
  with verdicts as (
    select l.user_id, l.track_id, true as hearted from twin_likes l where l.user_id in (auth.uid(), p_person)
    union all
    select s.user_id, s.track_id, false from people_swipes s
    where s.user_id in (auth.uid(), p_person)
      and not exists (select 1 from twin_likes l where l.user_id = s.user_id and l.track_id = s.track_id)
  ),
  o as (
    select count(*)::int as both_rated,
      count(*) filter (where t.hearted)::int as they_hearted_i_rated,
      count(*) filter (where m.hearted)::int as i_hearted_they_rated,
      coalesce(array_agg(t.track_id) filter (where t.hearted and m.hearted), '{}') as shared_tracks
    from verdicts t join verdicts m on m.track_id = t.track_id and m.user_id = auth.uid()
    where t.user_id = p_person
  ),
  e as (
    select greatest(o.they_hearted_i_rated * people_rate(auth.uid(), p_person), o.i_hearted_they_rated * people_rate(p_person, auth.uid()))::real as expected from o
  ),
  sc as (select ((coalesce(array_length(o.shared_tracks, 1), 0) + 1.0) / (e.expected + 1.0))::real as score from o, e)
  select o.shared_tracks, o.both_rated, o.they_hearted_i_rated, o.i_hearted_they_rated, e.expected, sc.score,
    coalesce(array_length(o.shared_tracks, 1), 0) >= st.min_shared and o.both_rated >= st.min_rated and sc.score >= st.min_score
  from o, e, sc, (select * from people_settings limit 1) st
$$;

-- Who you're in tune with, plus anyone you've swapped a wave with. The server decides who that is;
-- the phone only ranks them and words it. Nothing here for anyone who isn't a member.
create function my_people() returns table (
  person uuid, name text, mode text, shared_tracks bigint[], both_rated int, expected real,
  i_waved boolean, they_waved boolean, print jsonb
)
language sql security definer set search_path = public stable as $$
  with me as (select user_id, intent from twin_profiles where user_id = auth.uid() and people_member(auth.uid())),
  others as (
    select p.user_id, p.name, p.print, people_mode(me.intent, p.intent) as mode from twin_profiles p, me
    where p.user_id <> me.user_id and people_member(p.user_id) and not twins_blocked(me.user_id, p.user_id)
  )
  select o.user_id, o.name, coalesce(o.mode, 'friends'), v.shared_tracks, v.both_rated, v.expected, w.i_waved, w.they_waved, o.print
  from others o
  cross join lateral people_overlap(o.user_id) v
  cross join lateral (select
      exists (select 1 from twin_waves x where x.from_user = auth.uid() and x.to_user = o.user_id) as i_waved,
      exists (select 1 from twin_waves x where x.from_user = o.user_id and x.to_user = auth.uid()) as they_waved
  ) w
  where w.i_waved or w.they_waved or (o.mode is not null and v.in_tune)
  order by v.score desc
  limit 20
$$;

-- The songs you share. Everything else they hearted, only once you've both waved.
create function person_songs(p_person uuid) returns table (track_id bigint, shared boolean)
language sql security definer set search_path = public stable as $$
  with allowed as (
    select people_member(auth.uid()) and people_member(p_person) and not twins_blocked(auth.uid(), p_person)
      and (
        (select in_tune from people_overlap(p_person))
        or exists (select 1 from twin_waves where (from_user = auth.uid() and to_user = p_person) or (from_user = p_person and to_user = auth.uid()))
      ) as yes
  ),
  mutual as (
    select exists (select 1 from twin_waves where from_user = auth.uid() and to_user = p_person)
       and exists (select 1 from twin_waves where from_user = p_person and to_user = auth.uid()) as yes
  ),
  songs as (
    select t.track_id, exists (select 1 from twin_likes m where m.user_id = auth.uid() and m.track_id = t.track_id) as shared
    from twin_likes t where t.user_id = p_person
  )
  select s.track_id, s.shared from songs s, allowed a, mutual u
  where a.yes and (s.shared or u.yes)
  order by s.shared desc, s.track_id
  limit 40
$$;

-- How close you are, for the row above the card when nobody's in tune yet. Counts only.
create function people_progress() returns table (close int, judged int, members int)
language sql security definer set search_path = public stable as $$
  with me as (select user_id, intent from twin_profiles where user_id = auth.uid() and people_member(auth.uid())),
  others as (
    select p.user_id from twin_profiles p, me
    where p.user_id <> me.user_id and people_member(p.user_id) and not twins_blocked(me.user_id, p.user_id)
      and people_mode(me.intent, p.intent) is not null
  )
  select
    (select count(*)::int from others o where exists (
      select 1 from twin_likes t join twin_likes m on m.track_id = t.track_id and m.user_id = auth.uid() where t.user_id = o.user_id
    )),
    (select count(*)::int from people_swipes s, me where s.user_id = me.user_id),
    (select count(*)::int from others)
  from me
$$;

-- For the paper: what a pair's score was when they first saw each other, and now.
create function people_log_shown(p_person uuid, p_shared int, p_rated int, p_score real) returns boolean
language plpgsql security definer set search_path = public as $$
declare clamped real := least(greatest(coalesce(p_score, 0), 0), 1000);
begin
  if not people_member(auth.uid()) or not people_member(p_person) then return false; end if;
  insert into people_shown (user_id, person, first_score, score, shared, rated)
    values (auth.uid(), p_person, clamped, clamped, greatest(coalesce(p_shared, 0), 0), greatest(coalesce(p_rated, 0), 0))
    on conflict (user_id, person) do update
    set last_shown_at = now(), score = excluded.score, shared = excluded.shared, rated = excluded.rated;
  return true;
end $$;

-- A wave needs both people in People, no block, and being in tune (or their wave to answer). Ten a day.
create function people_can_wave(p_to uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select people_member(auth.uid()) and people_member(p_to) and auth.uid() <> p_to
    and not twins_blocked(auth.uid(), p_to)
    and people_mode((select intent from twin_profiles where user_id = auth.uid()), (select intent from twin_profiles where user_id = p_to)) is not null
    and (select count(*) from twin_waves where from_user = auth.uid() and created_at > now() - interval '1 day')
      < (select waves_per_day from people_settings limit 1)
    and (
      exists (select 1 from twin_waves where from_user = p_to and to_user = auth.uid())
      or (select in_tune from people_overlap(p_to))
    )
$$;
drop policy adult_waves on twin_waves;
create policy people_waves on twin_waves for insert to authenticated
  with check (from_user = auth.uid() and people_can_wave(to_user));

-- "Might be under 18" hides a profile at once; anything else still takes three people.
create or replace function hide_reported_twin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.reason = 'under 18' or (select count(*) from twin_reports where reported = new.reported) >= 3 then
    update twin_profiles set hidden = true where user_id = new.reported;
  end if;
  return new;
end $$;
create or replace function keep_twin_hidden() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.hidden := coalesce((select count(*) >= 3 or bool_or(reason = 'under 18') from twin_reports where reported = new.user_id), false);
  return new;
end $$;

-- Taste Twins is retired: old builds get an empty list, so they can't show People members
-- to anyone, under-18s included, and a member's other songs need a mutual wave.
create or replace function my_twins() returns table (
  twin uuid, name text, both_liked int, both_skipped int, disagreed int, same_songs int, same_artists int,
  i_waved boolean, they_waved boolean, can_wave boolean
)
language sql security definer set search_path = public stable as $$
  select null::uuid, null::text, 0, 0, 0, 0, 0, false, false, false where false
$$;
create or replace function twin_songs(twin uuid) returns table (track_id bigint, shared boolean)
language sql security definer set search_path = public stable as $$
  select t.track_id, exists (select 1 from twin_likes m where m.user_id = auth.uid() and m.track_id = t.track_id)
  from twin_likes t
  where t.user_id = twin and twin_is_adult(auth.uid()) and twin_is_adult(twin) and not twins_blocked(auth.uid(), twin)
    and exists (select 1 from twin_waves where from_user = auth.uid() and to_user = twin)
    and exists (select 1 from twin_waves where from_user = twin and to_user = auth.uid())
  limit 40
$$;

-- Leaving deletes everything People holds about you.
create or replace function leave_twins() returns void
language sql security definer set search_path = public as $$
  delete from twin_waves where from_user = auth.uid() or to_user = auth.uid();
  delete from twin_blocks where from_user = auth.uid();
  delete from twin_reports where reporter = auth.uid();
  delete from twin_likes where user_id = auth.uid();
  delete from people_swipes where user_id = auth.uid();
  delete from people_shown where user_id = auth.uid() or person = auth.uid();
  delete from twin_profiles where user_id = auth.uid();
$$;

-- A fresh account on a phone that had joined takes everything back, People's tables included.
create or replace function claim_twin_profile(device uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare old uuid;
begin
  if exists (select 1 from twin_profiles where user_id = auth.uid()) then return false; end if;
  select user_id into old from twin_profiles where device_id = device;
  if old is null or old = auth.uid() then return false; end if;
  delete from twin_likes where user_id = auth.uid(); -- strays synced before the claim
  delete from people_swipes where user_id = auth.uid();
  update twin_likes set user_id = auth.uid() where user_id = old;
  update people_swipes set user_id = auth.uid() where user_id = old;
  update people_shown set user_id = auth.uid() where user_id = old;
  update people_shown set person = auth.uid() where person = old;
  update twin_waves set from_user = auth.uid() where from_user = old;
  update twin_waves set to_user = auth.uid() where to_user = old;
  update twin_blocks set from_user = auth.uid() where from_user = old;
  update twin_blocks set to_user = auth.uid() where to_user = old;
  update twin_reports set reporter = auth.uid() where reporter = old;
  update twin_reports set reported = auth.uid() where reported = old;
  update twin_profiles set user_id = auth.uid() where user_id = old;
  return true;
end $$;

revoke execute on function people_mode(text, text), people_member(uuid), people_rate(uuid, uuid), people_overlap(uuid), join_people(), people_deck(int),
  people_swipe(bigint, boolean, text), my_people(), person_songs(uuid), people_progress(),
  people_log_shown(uuid, int, int, real), people_can_wave(uuid) from public, anon;
grant execute on function join_people(), people_deck(int), people_swipe(bigint, boolean, text), my_people(),
  person_songs(uuid), people_progress(), people_log_shown(uuid, int, int, real), people_can_wave(uuid) to authenticated;
