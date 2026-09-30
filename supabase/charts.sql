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
