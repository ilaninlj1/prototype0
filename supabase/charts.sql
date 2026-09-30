-- Daily chart snapshots, so the app can show what's rising.
-- Only the server's daily job (charts-auto.sql) writes them.
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
