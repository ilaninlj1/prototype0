-- Human-only: "Sounds like AI?" reports. Three different phones reporting the
-- same artist hides them for everyone who keeps AI music hidden (the default).
create table ai_reports (
  artist_key text not null check (char_length(artist_key) between 1 and 120),
  device_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (artist_key, device_id)
);
alter table ai_reports enable row level security;
create policy report_ai on ai_reports for insert to anon with check (true);

-- Only the verdict is public, never who reported.
create view ai_reported as
  select artist_key from ai_reports group by artist_key having count(*) >= 3;
grant select on ai_reported to anon;
