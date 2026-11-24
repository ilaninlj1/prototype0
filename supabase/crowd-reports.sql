-- Crowd reports come from accounts, not from whatever id the caller types
-- (threat-model.md TM-002, docs/threat-map.md area D).
--
-- Before: anyone who pulled the public key out of the app could send three
-- reports with three made-up device ids and hide a real artist ("Sounds like
-- AI?") or a comment for everyone.
-- After: a report needs a signed-in Supabase account (the invisible anonymous
-- one People and Bottles already use is enough), and its device_id must be that
-- account's id. Three reports now means three accounts, and Supabase limits how
-- fast one IP address can make new anonymous accounts.
--
-- Reports sent before this still count. Builds older than this change can't
-- send reports any more; nothing else breaks for them.
-- Checked by supabase/crowd-sim.mjs. Run once in the dashboard's SQL editor;
-- running it again is safe.

begin;

drop policy if exists report_ai on ai_reports;
drop policy if exists report_ai_as_account on ai_reports;
create policy report_ai_as_account on ai_reports for insert to authenticated
  with check (device_id = auth.uid());

drop policy if exists report_comments on comment_reports;
drop policy if exists report_comments_as_account on comment_reports;
create policy report_comments_as_account on comment_reports for insert to authenticated
  with check (device_id = auth.uid());

commit;
