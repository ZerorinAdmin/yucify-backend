-- Saved AI competitor analyses per user + page
create table public.saved_competitor_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  page_id text not null,
  page_name text not null,
  analysis_json jsonb not null,
  ad_count integer,
  dominant_format text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, page_id)
);

create index saved_competitor_analyses_user_updated_idx
  on public.saved_competitor_analyses (user_id, updated_at desc);

alter table public.saved_competitor_analyses enable row level security;

create policy "Users can view own saved competitor analyses"
  on public.saved_competitor_analyses for select
  using (auth.uid() = user_id);

create policy "Users can insert own saved competitor analyses"
  on public.saved_competitor_analyses for insert
  with check (auth.uid() = user_id);

create policy "Users can update own saved competitor analyses"
  on public.saved_competitor_analyses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own saved competitor analyses"
  on public.saved_competitor_analyses for delete
  to authenticated
  using (auth.uid() = user_id);
