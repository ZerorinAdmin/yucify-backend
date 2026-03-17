-- AI analysis usage tracking: one row per analyzeCompetitorAds call.
-- Used to enforce daily_analysis_limit per user.
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

-- Users can insert their own (when analysis runs)
create policy "Users can insert own ai_analysis_requests"
  on public.ai_analysis_requests for insert
  with check (auth.uid() = user_id);

-- Users can read their own (for usage display / debugging)
create policy "Users can view own ai_analysis_requests"
  on public.ai_analysis_requests for select
  using (auth.uid() = user_id);

comment on table public.ai_analysis_requests is 'Tracks AI competitor analysis calls for daily limit enforcement.';
