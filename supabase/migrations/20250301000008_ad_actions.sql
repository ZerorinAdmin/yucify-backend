-- Stores per-ad per-day action breakdowns from Meta (purchases, installs, leads, etc.)
-- Normalized: one row per (user, ad, date, action_type)
create table public.ad_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  ad_id text not null,
  date date not null,
  action_type text not null,
  action_count numeric(14,2) not null default 0,
  action_value numeric(14,2) not null default 0,
  unique(user_id, ad_id, date, action_type)
);

alter table public.ad_actions enable row level security;

create policy "Users can view own ad_actions"
  on public.ad_actions for select
  using (auth.uid() = user_id);

create policy "Users can insert own ad_actions"
  on public.ad_actions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own ad_actions"
  on public.ad_actions for update
  using (auth.uid() = user_id);

create index ad_actions_user_ad_date_idx on public.ad_actions(user_id, ad_id, date desc);
