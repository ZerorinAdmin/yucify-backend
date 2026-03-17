-- Update daily usage limits: 4 scrapes/day, 3 analyses/day.
alter table public.user_usage_limits
  alter column daily_scrape_limit set default 4,
  alter column daily_analysis_limit set default 3;

-- Apply new limits to existing users
update public.user_usage_limits
set daily_scrape_limit = 4, daily_analysis_limit = 3, updated_at = now();
