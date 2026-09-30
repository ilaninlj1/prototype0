-- Song comments + one-word "vibes", visible only after a reveal (the app
-- enforces that). Anyone can read and post; there is no editing. A comment
-- reported by 3 different devices hides itself (Apple requires a report
-- path for user-generated content).

create table comments (
  id bigint generated always as identity primary key,
  track_id bigint not null,
  device_id uuid not null,
  name text not null default 'A listener' check (char_length(name) between 1 and 30),
  body text not null check (char_length(body) between 1 and 280),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_track on comments (track_id, created_at desc);

create table comment_reports (
  comment_id bigint not null references comments(id) on delete cascade,
  device_id uuid not null,
  primary key (comment_id, device_id)
);

create table vibes (
  track_id bigint not null,
  device_id uuid not null,
  word text not null check (char_length(word) between 1 and 24),
  primary key (track_id, device_id, word)
);

create view vibe_counts as
  select track_id, word, count(*)::int as count from vibes group by track_id, word;

alter table comments enable row level security;
alter table comment_reports enable row level security;
alter table vibes enable row level security;

create policy read_visible_comments on comments for select to anon using (not hidden);
create policy post_comments on comments for insert to anon with check (not hidden);
create policy report_comments on comment_reports for insert to anon with check (true);
create policy add_vibes on vibes for insert to anon with check (true);
grant select on vibe_counts to anon;

-- Three reports from different devices hide a comment.
create function hide_reported_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from comment_reports where comment_id = new.comment_id) >= 3 then
    update comments set hidden = true where id = new.comment_id;
  end if;
  return new;
end $$;

create trigger comment_reported after insert on comment_reports
  for each row execute function hide_reported_comment();
