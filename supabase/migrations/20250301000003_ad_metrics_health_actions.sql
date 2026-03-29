-- Ad metrics: daily snapshots per ad (spend, impressions, clicks, CTR, CPC, frequency, ROAS, reach)
create table public.ad_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  ad_account_id text not null,
  ad_id text not null,
  ad_name text not null default '',
  campaign_name text not null default '',
  adset_name text not null default '',
  date date not null,
  spend numeric(12,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  ctr numeric(8,4) not null default 0,
  cpc numeric(12,4) not null default 0,
  frequency numeric(8,4) not null default 0,
  roas numeric(12,4) not null default 0,
  reach bigint not null default 0,
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

----------------------------------------------------------------------
-- Ad health status: tracks latest health per ad for transition detection
----------------------------------------------------------------------
create table public.ad_health_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  ad_id text not null,
  ad_name text not null default '',
  status text not null check (status in ('HEALTHY', 'DECLINING', 'FATIGUED')),
  rules_triggered text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique(user_id, ad_id)
);

alter table public.ad_health_status enable row level security;

create policy "Users can view own ad_health_status"
  on public.ad_health_status for select
  using (auth.uid() = user_id);

create policy "Users can insert own ad_health_status"
  on public.ad_health_status for insert
  with check (auth.uid() = user_id);

create policy "Users can update own ad_health_status"
  on public.ad_health_status for update
  using (auth.uid() = user_id);

----------------------------------------------------------------------
-- Email alert queue: non-blocking alert delivery
----------------------------------------------------------------------
create table public.email_alert_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  ad_id text not null,
  ad_name text not null default '',
  previous_status text not null,
  new_status text not null,
  rules_triggered text[] not null default '{}',
  recipient_email text not null,
  sent boolean not null default false,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.email_alert_queue enable row level security;

create policy "Users can view own email_alert_queue"
  on public.email_alert_queue for select
  using (auth.uid() = user_id);

create policy "Users can insert own email_alert_queue"
  on public.email_alert_queue for insert
  with check (auth.uid() = user_id);

create policy "Users can update own email_alert_queue"
  on public.email_alert_queue for update
  using (auth.uid() = user_id);

create index email_alert_queue_pending_idx on public.email_alert_queue(sent, created_at)
  where sent = false;

----------------------------------------------------------------------
-- Ad actions: per-ad per-day action breakdowns (purchases, installs, leads, etc.)
----------------------------------------------------------------------
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
