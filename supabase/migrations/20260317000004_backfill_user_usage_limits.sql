-- Backfill user_usage_limits for existing users who don't have a row.
-- New users get a row via auth callback; this covers users created before that change.
insert into public.user_usage_limits (user_id, daily_scrape_limit, daily_analysis_limit)
select id, 4, 3
from auth.users
where id not in (select user_id from public.user_usage_limits)
on conflict (user_id) do nothing;
