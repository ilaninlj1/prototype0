-- Only the server's daily job writes chart snapshots now. Phones used to
-- save them too, which let anyone with the app's public key post fake charts.
drop policy if exists save_snapshots on chart_snapshots;
revoke insert, update, delete on chart_snapshots from anon, authenticated;

-- Nobody but the server needs to see who posted a comment, report or vibe.
revoke select on comments from anon;
grant select (id, track_id, name, body, created_at) on comments to anon;
