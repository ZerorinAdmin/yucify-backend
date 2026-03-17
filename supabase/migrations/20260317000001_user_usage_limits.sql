-- User usage limits: per-user overrides for daily scrape and AI analysis limits.
-- Defaults (10 scrapes, 4 analyses) are applied when no row exists.
-- Future: subscription_tier can drive limits from subscription_plans.
create table public.user_usage_limits (
  user_id uuid references auth.users (id) on delete cascade primary key,
  daily_scrape_limit integer not null default 10,
  daily_analysis_limit integer not null default 4,
  subscription_tier text,
  updated_at timestamptz not null default now()
);

alter table public.user_usage_limits enable row level security;

-- Users can read their own limits (for UI display)
create policy "Users can view own usage limits"
  on public.user_usage_limits for select
  using (auth.uid() = user_id);

-- No INSERT/UPDATE policy for authenticated users.
-- Admin API will use service_role client to bypass RLS when setting limits.

comment on table public.user_usage_limits is 'Per-user daily usage limits. Null subscription_tier reserved for future subscription integration.';
