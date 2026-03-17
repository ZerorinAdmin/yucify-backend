-- Tracks the latest known health status per ad so we can detect transitions
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

-- Queue table for email alerts (non-blocking: write to queue, process async)
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
