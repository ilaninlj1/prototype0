-- Fix: Supabase rejects a DELETE without a WHERE clause.
create or replace function request_chart_feeds() returns void
language plpgsql security definer set search_path = public, net as $$
declare c text;
begin
  delete from chart_feed_requests where true; -- Supabase rejects a DELETE without WHERE
  foreach c in array array['us','gb','br','za','ng','jp','kr','mx','co','in','ph','tr','eg','fr','de','se','es','au'] loop
    insert into chart_feed_requests (country, request_id)
    values (c, net.http_get('https://rss.applemarketingtools.com/api/v2/' || c || '/music/most-played/50/songs.json', timeout_milliseconds := 25000));
  end loop;
end $$;
