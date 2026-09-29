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
