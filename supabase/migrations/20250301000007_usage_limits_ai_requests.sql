-- Per-user daily usage limits (scrape + AI analysis).
-- Admin API uses service_role to bypass RLS when setting limits.
create table public.user_usage_limits (
  user_id uuid references auth.users (id) on delete cascade primary key,
  daily_scrape_limit integer not null default 4,
  daily_analysis_limit integer not null default 3,
  subscription_tier text,
  updated_at timestamptz not null default now()
);

alter table public.user_usage_limits enable row level security;

create policy "Users can view own usage limits"
  on public.user_usage_limits for select
  using (auth.uid() = user_id);

----------------------------------------------------------------------
-- AI analysis request log (for daily limit enforcement)
----------------------------------------------------------------------
create table public.ai_analysis_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade not null,
  page_id text not null,
  page_name text not null default '',
  ad_count integer not null,
  created_at timestamptz not null default now()
);

create index ai_analysis_requests_user_created_idx
  on public.ai_analysis_requests (user_id, created_at desc);

alter table public.ai_analysis_requests enable row level security;

create policy "Users can insert own ai_analysis_requests"
  on public.ai_analysis_requests for insert
  with check (auth.uid() = user_id);

create policy "Users can view own ai_analysis_requests"
  on public.ai_analysis_requests for select
  using (auth.uid() = user_id);

-- Backfill usage limits for any existing users who don't have a row yet.
-- New users get a row via auth callback; this covers users created before that change.
insert into public.user_usage_limits (user_id, daily_scrape_limit, daily_analysis_limit)
select id, 4, 3
from auth.users
where id not in (select user_id from public.user_usage_limits)
on conflict (user_id) do nothing;
