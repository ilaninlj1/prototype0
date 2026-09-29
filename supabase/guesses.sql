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
