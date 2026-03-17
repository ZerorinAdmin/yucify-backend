-- Ad metrics: daily snapshots per ad (per requirements step 3)
create table public.ad_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  ad_account_id text not null,
  ad_id text not null,
  ad_name text not null default '',
  date date not null,
  spend numeric(12,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  ctr numeric(8,4) not null default 0,
  cpc numeric(12,4) not null default 0,
  frequency numeric(8,4) not null default 0,
  roas numeric(12,4) not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id, ad_id, date)
);

alter table public.ad_metrics enable row level security;

create policy "Users can view own ad_metrics"
  on public.ad_metrics for select
  using (auth.uid() = user_id);

create policy "Users can insert own ad_metrics"
  on public.ad_metrics for insert
  with check (auth.uid() = user_id);

create policy "Users can update own ad_metrics"
  on public.ad_metrics for update
  using (auth.uid() = user_id);

create index ad_metrics_user_date_idx on public.ad_metrics(user_id, date desc);
create index ad_metrics_ad_date_idx on public.ad_metrics(ad_id, date desc);
