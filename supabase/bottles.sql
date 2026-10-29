-- Bottles (docs/superpowers/specs/2026-10-28-bottles-design.md): a blind save floats to a
-- stranger, washes up blind, and carries the chain of people who kept it. Every row belongs to
-- a Supabase anonymous-auth user (auth.uid()), as with Taste Twins. Phones never touch the
-- tables: RLS is on with no policies and no grants, and everything goes through the four
-- functions at the bottom. Needs supabase/ai-reports.sql (the ai_reported view) first.
-- Checked by supabase/bottles-sim.mjs.

create table bottles (
  id uuid primary key default gen_random_uuid(),
  track_id bigint not null check (track_id > 0),
  artist_key text not null check (char_length(artist_key) between 1 and 120),
  genre_tag text not null default '' check (char_length(genre_tag) <= 60),
  launched_by uuid references auth.users(id) on delete set null,
  launched_at timestamptz not null default now(),
  old boolean not null default false,
  state text not null default 'floating' check (state in ('floating', 'sunk', 'retired')),
  keeps int not null default 0,
  passes int not null default 0,
  passes_in_row int not null default 0,
  unplayable int not null default 0,
  holder uuid references auth.users(id) on delete set null,
  lease_until timestamptz,
  -- Launch and keeps move a bottle (the "fresh" order); keeps, sinking and retiring change it (my_bottles' since).
  last_moved_at timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  unique (launched_by, track_id)
);
create index bottles_floating on bottles (last_moved_at) where state = 'floating';

-- The visible chain. Only a city, a country and coordinates rounded to 0.5° ever go in.
create table bottle_hops (
  id bigint generated always as identity primary key,
  bottle_id uuid not null references bottles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('launch', 'keep')),
  city text not null check (char_length(city) between 1 and 80),
  country text not null default '' check (char_length(country) <= 80),
  lat real not null check (lat between -90 and 90),
  lng real not null check (lng between -180 and 180),
  exact boolean not null default true,
  tier text check (tier in ('close', 'new', 'deep')),
  ring jsonb check (ring is null or (jsonb_typeof(ring) = 'object' and octet_length(ring::text) <= 200)),
  at timestamptz not null default now()
);
create index bottle_hops_chain on bottle_hops (bottle_id, id);
-- Never the same person twice in one chain.
create unique index bottle_hops_once on bottle_hops (bottle_id, user_id) where user_id is not null;

-- Who was lent which bottle, and what they decided: a bottle never washes up for the same phone twice.
create table bottle_offers (
  bottle_id uuid not null references bottles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  offered_at timestamptz not null default now(),
  verdict text check (verdict in ('keep', 'pass', 'known', 'unplayable')),
  decided_at timestamptz,
  primary key (bottle_id, user_id)
);

alter table bottles enable row level security;
alter table bottle_hops enable row level security;
alter table bottle_offers enable row level security;
revoke all on bottles, bottle_hops, bottle_offers from public, anon, authenticated;

-- A place from a phone, cleaned again here: the city is cut to 80 characters and the
-- coordinates rounded to 0.5° even if a modified app sends more.
create function bottle_clean_place(p jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'city', left(coalesce(nullif(btrim(regexp_replace(p->>'city', '[[:cntrl:]]', '', 'g')), ''), 'Somewhere'), 80),
    'country', left(coalesce(btrim(regexp_replace(p->>'country', '[[:cntrl:]]', '', 'g')), ''), 80),
    'lat', greatest(-90, least(90, round(coalesce((p->>'lat')::numeric, 0) * 2) / 2)),
    'lng', greatest(-180, least(180, round(coalesce((p->>'lng')::numeric, 0) * 2) / 2)),
    'exact', coalesce((p->>'exact')::boolean, false))
$$;

-- A ring seed (key, mode, energy, tempo from the keeper's previous save), or null if anything is off.
create function bottle_clean_ring(r jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select case
    when r is null or jsonb_typeof(r) <> 'object' then null
    when jsonb_typeof(r->'energy') <> 'number' or jsonb_typeof(r->'tempo') <> 'number' then null
    when (r->>'energy')::numeric not between 0 and 1 or (r->>'tempo')::numeric not between 30 and 250 then null
    when r->'key' is not null and jsonb_typeof(r->'key') <> 'null'
      and (jsonb_typeof(r->'key') <> 'number' or (r->>'key')::numeric not in (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11)) then null
    when r->'mode' is not null and jsonb_typeof(r->'mode') <> 'null'
      and (jsonb_typeof(r->'mode') <> 'number' or (r->>'mode')::numeric not in (0, 1)) then null
    else jsonb_build_object('key', r->'key', 'mode', r->'mode', 'energy', (r->>'energy')::numeric, 'tempo', (r->>'tempo')::numeric)
  end
$$;

-- One bottle with its whole chain, as the app reads it.
create function bottle_json(p_id uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', b.id, 'track_id', b.track_id, 'artist_key', b.artist_key, 'genre_tag', b.genre_tag,
    'keeps', b.keeps, 'passes', b.passes, 'state', b.state,
    'last_moved_at', b.last_moved_at, 'changed_at', b.changed_at,
    'hops', coalesce((
      select json_agg(json_build_object(
        'kind', h.kind, 'city', h.city, 'country', h.country, 'lat', h.lat, 'lng', h.lng,
        'exact', h.exact, 'tier', h.tier, 'ring', h.ring, 'at', h.at) order by h.id)
      from bottle_hops h where h.bottle_id = b.id), '[]'::json))
  from bottles b where b.id = p_id
$$;

-- Launch: a blind save floats. 20 a day (rolling), plus up to 30 old finds once, ever.
create function float_bottle(p_track_id bigint, p_artist_key text, p_genre_tag text, p_place json, p_old boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pl jsonb := bottle_clean_place(p_place::jsonb);
  new_id uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_old then
    if (select count(*) from bottles where launched_by = me and old) >= 30 then
      return json_build_object('error', 'cap');
    end if;
  elsif (select count(*) from bottles where launched_by = me and not old and launched_at > now() - interval '1 day') >= 20 then
    return json_build_object('error', 'cap');
  end if;
  insert into bottles (track_id, artist_key, genre_tag, launched_by, old)
  values (p_track_id, left(lower(btrim(p_artist_key)), 120), left(lower(btrim(coalesce(p_genre_tag, ''))), 60), me, coalesce(p_old, false))
  on conflict (launched_by, track_id) do nothing
  returning id into new_id;
  if new_id is null then return json_build_object('error', 'duplicate'); end if;
  insert into bottle_hops (bottle_id, user_id, kind, city, country, lat, lng, exact)
  values (new_id, me, 'launch', pl->>'city', pl->>'country', (pl->>'lat')::real, (pl->>'lng')::real, (pl->>'exact')::boolean);
  return json_build_object('id', new_id);
end $$;

-- Wash up: lend one floating bottle to this phone for 2 hours. Your genre first, then any;
-- within that, a coin flip between the freshest bottle and the one that has waited longest.
create function claim_bottle(p_genre_tag text) returns json
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  fresh boolean := random() < 0.5;
  genre text := lower(btrim(coalesce(p_genre_tag, '')));
  picked uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  select b.id into picked from bottles b
  where b.state = 'floating'
    and b.launched_by is distinct from me
    and (b.holder is null or b.lease_until < now())
    and not exists (select 1 from bottle_offers o where o.bottle_id = b.id and o.user_id = me)
    and not exists (select 1 from bottle_hops h where h.bottle_id = b.id and h.user_id = me)
    and not exists (select 1 from ai_reported a where a.artist_key = b.artist_key)
  order by (genre <> '' and b.genre_tag = genre) desc,
    case when fresh then b.last_moved_at end desc nulls last,
    case when not fresh then b.last_moved_at end asc nulls last
  limit 1
  for update of b skip locked;
  if picked is null then return null; end if;
  update bottles set holder = me, lease_until = now() + interval '2 hours' where id = picked;
  insert into bottle_offers (bottle_id, user_id) values (picked, me)
  on conflict (bottle_id, user_id) do update set offered_at = now();
  return bottle_json(picked);
end $$;

-- The verdict. Counts only from the phone it was lent to, while no one else holds it.
create function decide_bottle(p_id uuid, p_verdict text, p_place json, p_tier text, p_ring json)
returns json language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  b bottles;
  pl jsonb;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_verdict is null or p_verdict not in ('keep', 'pass', 'known', 'unplayable') then raise exception 'bad verdict'; end if;
  select * into b from bottles where id = p_id for update;
  if b.id is null or not exists (select 1 from bottle_offers where bottle_id = p_id and user_id = me and verdict is null) then
    return json_build_object('ok', false);
  end if;
  update bottle_offers set verdict = p_verdict, decided_at = now() where bottle_id = p_id and user_id = me;
  if b.state <> 'floating' or (b.holder is not null and b.holder <> me and b.lease_until >= now()) then
    return json_build_object('ok', false);
  end if;
  if p_verdict = 'keep' then
    pl := bottle_clean_place(p_place::jsonb);
    insert into bottle_hops (bottle_id, user_id, kind, city, country, lat, lng, exact, tier, ring)
    values (p_id, me, 'keep', pl->>'city', pl->>'country', (pl->>'lat')::real, (pl->>'lng')::real, (pl->>'exact')::boolean,
      case when p_tier in ('close', 'new', 'deep') then p_tier end, bottle_clean_ring(p_ring::jsonb))
    on conflict do nothing;
    update bottles set keeps = keeps + 1, passes_in_row = 0, last_moved_at = now(), changed_at = now(),
      holder = null, lease_until = null where id = p_id;
  elsif p_verdict = 'pass' then
    update bottles set passes = passes + 1, passes_in_row = passes_in_row + 1,
      state = case when passes_in_row + 1 >= 5 then 'sunk' else state end,
      changed_at = case when passes_in_row + 1 >= 5 then now() else changed_at end,
      holder = null, lease_until = null where id = p_id;
  elsif p_verdict = 'unplayable' then
    update bottles set unplayable = unplayable + 1,
      state = case when unplayable + 1 >= 3 then 'retired' else state end,
      changed_at = case when unplayable + 1 >= 3 then now() else changed_at end,
      holder = null, lease_until = null where id = p_id;
  else
    update bottles set holder = null, lease_until = null where id = p_id;
  end if;
  select * into b from bottles where id = p_id;
  return json_build_object('ok', true, 'keeps', b.keeps, 'state', b.state);
end $$;

-- Bottles you launched or kept, changed since your last look (all of them when p_since is null), newest first.
create function my_bottles(p_since timestamptz) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(bottle_json(x.id) order by x.changed_at desc), '[]'::json)
  from (
    select b.id, b.changed_at from bottles b
    where (b.launched_by = auth.uid()
        or exists (select 1 from bottle_hops h where h.bottle_id = b.id and h.user_id = auth.uid() and h.kind = 'keep'))
      and (p_since is null or b.changed_at > p_since)
    order by b.changed_at desc
    limit 200
  ) x
$$;

revoke execute on function bottle_clean_place(jsonb), bottle_clean_ring(jsonb), bottle_json(uuid) from public, anon, authenticated;
revoke execute on function float_bottle(bigint, text, text, json, boolean), claim_bottle(text),
  decide_bottle(uuid, text, json, text, json), my_bottles(timestamptz) from public, anon;
grant execute on function float_bottle(bigint, text, text, json, boolean), claim_bottle(text),
  decide_bottle(uuid, text, json, text, json), my_bottles(timestamptz) to authenticated;
