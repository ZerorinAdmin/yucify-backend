-- Add campaign/adset context to ad_metrics
alter table public.ad_metrics
  add column if not exists campaign_name text not null default '',
  add column if not exists adset_name text not null default '';

-- Store ad creative data (thumbnail, image URL, creative type)
create table public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  ad_id text not null,
  ad_name text not null default '',
  campaign_name text not null default '',
  adset_name text not null default '',
  creative_id text not null default '',
  thumbnail_url text not null default '',
  image_url text not null default '',
  body text not null default '',
  link_url text not null default '',
  creative_type text not null default 'unknown',
  updated_at timestamptz not null default now(),
  unique(user_id, ad_id)
);

alter table public.ad_creatives enable row level security;

create policy "Users can view own ad_creatives"
  on public.ad_creatives for select
  using (auth.uid() = user_id);

create policy "Users can insert own ad_creatives"
  on public.ad_creatives for insert
  with check (auth.uid() = user_id);

create policy "Users can update own ad_creatives"
  on public.ad_creatives for update
  using (auth.uid() = user_id);
