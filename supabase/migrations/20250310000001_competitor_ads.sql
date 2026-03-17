-- Competitor ads scraping cache (per docs/scrapper.md)
create table public.competitor_ads (
  id uuid primary key default gen_random_uuid(),
  page_id text not null,
  ad_id text not null,
  ad_text text not null default '',
  image_url text,
  video_url text,
  cta text,
  landing_page_url text,
  ad_start_date timestamptz,
  ad_snapshot_url text,
  scraped_at timestamptz not null default now(),
  unique(ad_id)
);

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  page_id text not null unique,
  page_name text not null default '',
  page_icon text,
  first_scraped_at timestamptz not null default now()
);

create table public.competitor_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  page_id text not null,
  source text not null check (source in ('cache', 'scrape')),
  created_at timestamptz not null default now()
);

alter table public.competitor_ads enable row level security;
alter table public.competitors enable row level security;
alter table public.competitor_requests enable row level security;

-- All authenticated users can read cached ads (shared cache)
create policy "Authenticated users can read competitor_ads"
  on public.competitor_ads for select
  using (auth.role() = 'authenticated');

-- Service/authenticated can insert (cache population)
create policy "Authenticated users can insert competitor_ads"
  on public.competitor_ads for insert
  with check (auth.role() = 'authenticated');

-- Competitors: read and insert
create policy "Authenticated users can read competitors"
  on public.competitors for select
  using (auth.role() = 'authenticated');
create policy "Authenticated users can insert competitors"
  on public.competitors for insert
  with check (auth.role() = 'authenticated');

-- Competitor requests: users see own only
create policy "Users can view own competitor_requests"
  on public.competitor_requests for select
  using (auth.uid() = user_id);
create policy "Users can insert own competitor_requests"
  on public.competitor_requests for insert
  with check (auth.uid() = user_id);

create index competitor_ads_page_id_idx on public.competitor_ads(page_id);
create index competitor_ads_scraped_at_idx on public.competitor_ads(page_id, scraped_at desc);
create index competitor_requests_user_id_idx on public.competitor_requests(user_id);
