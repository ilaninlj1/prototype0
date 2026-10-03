-- Taste Decoded: "Sounds like me" / "Nope" on a finding, for the paper's
-- agreement rate. Anonymous on purpose: no device id, no user id, just the
-- kind of finding and the answer. Phones can only insert; the counts are
-- read with the server key (dashboard), never by the app.

create table decoded_votes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('never', 'never-all', 'genre', 'across')),
  measure text not null check (char_length(measure) between 1 and 20),
  side text not null check (side in ('low', 'high')),
  agree boolean not null,
  created_at timestamptz not null default now()
);

alter table decoded_votes enable row level security;
revoke all on decoded_votes from anon, authenticated;
grant insert (kind, measure, side, agree) on decoded_votes to anon;
create policy add_decoded_votes on decoded_votes for insert to anon with check (true);

create view decoded_vote_counts as
  select kind, measure, side,
    count(*) filter (where agree)::int as agree,
    count(*) filter (where not agree)::int as disagree
  from decoded_votes group by kind, measure, side;
revoke all on decoded_vote_counts from anon, authenticated;
